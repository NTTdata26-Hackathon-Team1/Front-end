import React, { useEffect, useRef, useState } from 'react';
import { Box, Typography, Button } from '@mui/material';
import { supabase } from './supabaseClient';
import { useNavigate } from 'react-router-dom';

type UsernameRow = { user_name: string };

// decide-and-route のレスポンス想定
type RouteEntry = { tab_id: string; to: string };
type DecideRouteResp = {
	ok: boolean;
	matched: boolean;
	leader_tab_id?: string;
	routes?: RouteEntry[];
	counts?: { ready: number; users: number };
};

const POLL_MS_ACTIVE = 3000;  // タブが見えている間のポーリング間隔
const POLL_MS_HIDDEN = 15000; // タブが非表示のときの間隔（負荷軽減）

function arraysEqual(a: string[], b: string[]) {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
	return true;
}

// 追加: sessionStorage から tab_id / user_name を取得
const getTabIdFromSession = () => sessionStorage.getItem('tab_id') ?? null;
const getUserNameFromSession = () => sessionStorage.getItem('user_name') ?? null;

const Standby: React.FC = () => {
	const [calling, setCalling] = useState(false);
	const [errMsg, setErrMsg] = useState<string | null>(null);
	const [usernames, setUsernames] = useState<string[]>([]);

	// 「準備完了」送信の状態
	const [readyState, setReadyState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
	const [readyMsg, setReadyMsg] = useState<string | null>(null);

	const cancelledRef = useRef(false);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const inFlightRef = useRef(false);
	const routedRef = useRef(false); // 一度遷移したら true にしてポーリング停止

	const navigate = useNavigate();

	const scheduleNext = () => {
		if (cancelledRef.current || routedRef.current) return;
		const interval = document.hidden ? POLL_MS_HIDDEN : POLL_MS_ACTIVE;
		timerRef.current = setTimeout(pollOnce, interval);
	};

	const pollOnce = async () => {
		if (cancelledRef.current || inFlightRef.current || routedRef.current) {
			scheduleNext();
			return;
		}
		inFlightRef.current = true;
		setErrMsg(null);

		try {
			// 1) ユーザー一覧（10分以内）を取得
			const { data: usersData, error: usersErr } =
				await supabase.functions.invoke<UsernameRow[]>('dynamic-api', {
					body: { method: 'send-username-list' }
				});
			if (cancelledRef.current || routedRef.current) return;

			if (usersErr) {
				setErrMsg(usersErr.message ?? 'Edge Function calling : failed (user list)');
			} else {
				const names =
					(usersData ?? [])
						.filter((row): row is UsernameRow => !!row && typeof (row as any).user_name === 'string')
						.map((row) => row.user_name);
				// 変化があるときだけ更新（無駄な再描画を抑制）
				setUsernames((prev) => (arraysEqual(prev, names) ? prev : names));
			}

			// 2) 直後にルーティング判定
			const { data: routeData, error: routeErr } =
				await supabase.functions.invoke<DecideRouteResp>('dynamic-api', {
					body: { method: 'decide-and-route' }
				});

			if (cancelledRef.current || routedRef.current) return;

			if (routeErr) {
				// 判定エラーは致命ではないので、メッセージだけ出して次回へ
				setErrMsg((prev) => prev ?? routeErr.message ?? 'Edge Function calling : failed (decide-and-route)');
			} else if (routeData?.ok && routeData.matched && Array.isArray(routeData.routes)) {
				const myTab = getTabIdFromSession();
				if (myTab) {
					const mine = routeData.routes.find((r) => r.tab_id === myTab);
					if (mine?.to && !routedRef.current) {
						routedRef.current = true;            // 多重遷移防止
						if (timerRef.current) clearTimeout(timerRef.current);
						navigate(mine.to);                   // 例: "/parenttopick" or "/childwating"
						return;
					}
				}
			}
		} catch (e: any) {
			if (!cancelledRef.current) setErrMsg(e?.message ?? 'unknown error');
		} finally {
			inFlightRef.current = false;
			if (!cancelledRef.current && !routedRef.current) scheduleNext();
		}
	};

	// 準備完了を Supabase へ記録（tab_id / user_name も一緒に保存）
	const handleReadyClick = async () => {
		if (readyState === 'sending' || readyState === 'done') return;
		setReadyState('sending');
		setReadyMsg(null);

		const tab_id = getTabIdFromSession();
		const user_name = getUserNameFromSession();

		if (!tab_id || !user_name) {
			setReadyState('error');
			setReadyMsg('tab_id または user_name が見つかりません（前ページでの保存を確認）');
			return;
		}

		try {
			const { error } = await supabase
				.from('is_ready')
				.insert({
					is_ready: true,   // 既存カラム
					tab_id,           // 追加
					user_name         // 追加
				}); // id/created_at はDB側 default

			if (error) {
				setReadyState('error');
				setReadyMsg(error.message ?? '準備完了の記録に失敗しました');
			} else {
				setReadyState('done');
				setReadyMsg('準備完了を記録しました');
			}
		} catch (e: any) {
			setReadyState('error');
			setReadyMsg(e?.message ?? '準備完了の記録に失敗しました（unknown error）');
		}
	};

	useEffect(() => {
		cancelledRef.current = false;

		// 初回即時実行
		pollOnce();

		// タブ可視状態の変化で即ポーリング
		const onVis = () => {
			if (!cancelledRef.current && !routedRef.current) {
				if (timerRef.current) clearTimeout(timerRef.current);
				pollOnce();
			}
		};
		document.addEventListener('visibilitychange', onVis);

		return () => {
			cancelledRef.current = true;
			if (timerRef.current) clearTimeout(timerRef.current);
			document.removeEventListener('visibilitychange', onVis);
		};
	}, []);

	return (
		<Box display="flex" flexDirection="column" alignItems="center" mt={8}>
			<Typography variant="h2" component="h1" gutterBottom>
				朝までそれ正解
			</Typography>

			{errMsg && (
				<Typography color="error" sx={{ mt: 1 }}>
					{errMsg}
				</Typography>
			)}

			<Box
				mt={4}
				mb={4}
				width={400}
				height={300}
				display="flex"
				flexDirection="column"
				alignItems="center"
				justifyContent="center"
				bgcolor="#ccc"
				border="1px solid #888"
			>
				<Typography variant="h5" component="div" fontStyle="italic" mb={2}>
					10分以内の名前のリスト
				</Typography>

				<Box component="ul" sx={{ listStyle: 'disc', pl: 4, fontSize: '1.5rem', fontStyle: 'italic', m: 0 }}>
					{usernames.length > 0 ? (
						usernames.map((name) => <li key={name}>{name}</li>)
					) : (
						<li style={{ listStyle: 'none', fontStyle: 'normal', opacity: 0.8 }}>
							（10分以内のユーザーなし）
						</li>
					)}
				</Box>
			</Box>

			<Button
				variant="outlined"
				sx={{ width: 120, fontSize: '1.2rem' }}
				onClick={handleReadyClick}
				disabled={readyState === 'sending' || readyState === 'done'}
			>
				{readyState === 'sending' ? '送信中…' : readyState === 'done' ? '送信済み' : '準備完了'}
			</Button>

			{readyMsg && (
				<Typography
					sx={{ mt: 1 }}
					color={readyState === 'error' ? 'error' : 'primary'}
				>
					{readyMsg}
				</Typography>
			)}
		</Box>
	);
};

export default Standby;


