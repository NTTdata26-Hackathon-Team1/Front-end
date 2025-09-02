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
	error?: string;
};

// ★ dynamic-api:get-tab-room-info のレスポンス
type RoomInfoByTabResp = {
	ok: boolean;
	room_name: string | null;
	num_of_r: number | null;
	members: string[];   // 部屋に所属するユーザー名の配列
	num_of_s: number;    // 同じ room_name レコード件数（部屋の参加人数の同期値）
	error?: string;
};

const POLL_MS_ACTIVE = 3000;   // タブが見えている間のポーリング間隔
const POLL_MS_HIDDEN = 15000;  // タブが非表示のとき（負荷軽減）

function arraysEqual(a: string[], b: string[]) {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
	return true;
}

// sessionStorage から tab_id / user_name を取得
const getTabIdFromSession = () => sessionStorage.getItem('tab_id') ?? null;
const getUserNameFromSession = () => sessionStorage.getItem('user_name') ?? null;

const Standby: React.FC = () => {
	const [errMsg, setErrMsg] = useState<string | null>(null);
	const [usernames, setUsernames] = useState<string[]>([]);

	// 部屋情報の表示用
	const [myRoomName, setMyRoomName] = useState<string | null>(null);
	const [myNumOfR, setMyNumOfR] = useState<number | null>(null);
	const [roomUsernames, setRoomUsernames] = useState<string[]>([]);
	const [roomCount, setRoomCount] = useState<number>(0); // num_of_s を表示したい場合に使用

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
			const myTab = getTabIdFromSession();

			// 1) ユーザー一覧（10分以内）
			const { data: usersData, error: usersErr } =
				await supabase.functions.invoke<UsernameRow[]>('dynamic-api', {
					body: { method: 'send-username-list' },
				});

			if (cancelledRef.current || routedRef.current) return;

			if (usersErr) {
				setErrMsg((prev) => prev ?? (usersErr.message || 'failed: send-username-list'));
			} else {
				const names =
					(usersData ?? [])
						.filter((row): row is UsernameRow => !!row && typeof (row as any).user_name === 'string')
						.map((row) => row.user_name);
				setUsernames((prev) => (arraysEqual(prev, names) ? prev : names));
			}

			// 1.5) 現在のタブIDに紐づく部屋情報を取得（dynamic-api:get-tab-room-info）
			if (myTab) {
				const { data: infoData, error: infoErr } =
					await supabase.functions.invoke<RoomInfoByTabResp>('dynamic-api', {
						body: { method: 'get-tab-room-info', params: { tab_id: myTab } }, // ← ここを修正
					});

				if (cancelledRef.current || routedRef.current) return;

				if (infoErr) {
					// non-2xx のときに来る一般的なメッセージ
					setErrMsg((prev) => prev ?? (infoErr.message || 'failed: get-tab-room-info'));
				} else if (!infoData?.ok) {
					// 200 でも {ok:false} の場合
					setErrMsg((prev) => prev ?? (infoData?.error || 'get-tab-room-info error'));
					// 表示はクリアしておく
					setMyRoomName(null);
					setMyNumOfR(null);
					setRoomUsernames([]);
					setRoomCount(0);
				} else {
					setMyRoomName(infoData.room_name ?? null);
					setMyNumOfR(typeof infoData.num_of_r === 'number' ? infoData.num_of_r : null);
					setRoomUsernames((prev) =>
						arraysEqual(prev, infoData.members ?? []) ? prev : (infoData.members ?? []));
					setRoomCount(typeof infoData.num_of_s === 'number' ? infoData.num_of_s : 0);
				}
			}

			// 2) ルーティング判定
			const { data: routeData, error: routeErr } =
				await supabase.functions.invoke<DecideRouteResp>('dynamic-api', {
					body: { method: 'decide-and-route' },
				});

			if (cancelledRef.current || routedRef.current) return;

			if (routeErr) {
				setErrMsg((prev) => prev ?? (routeErr.message || 'failed: decide-and-route'));
			} else if (routeData?.ok && routeData.matched && Array.isArray(routeData.routes)) {
				const myTabId = getTabIdFromSession();
				if (myTabId) {
					const mine = routeData.routes.find((r) => r.tab_id === myTabId);
					if (mine?.to && !routedRef.current) {
						routedRef.current = true;
						if (timerRef.current) clearTimeout(timerRef.current);
						navigate(mine.to); // 例: "/parenttopick" or "/childwating"
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
					is_ready: true,
					tab_id,
					user_name,
				});

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

			{/* 受け取った room_name / num_of_r / 部屋所属ユーザー一覧 */}
			<Box
				mt={3}
				width={520}
				p={2}
				border="1px solid #888"
				borderRadius={2}
				bgcolor="#f7f7f7"
			>
				<Typography variant="h6" gutterBottom>現在の部屋情報</Typography>
				<Typography>room name: <b>{myRoomName ?? '—'}</b></Typography>
				<Typography>round数(num_of_r): <b>{myNumOfR ?? '—'}</b></Typography>
				<Typography>この部屋の人数(num_of_s): <b>{roomCount}</b></Typography>
				<Typography sx={{ mt: 1 }}>この部屋のメンバー:</Typography>
				<Box component="ul" sx={{ listStyle: 'disc', pl: 4, m: 0 }}>
					{(roomUsernames && roomUsernames.length > 0)
						? roomUsernames.map((u) => <li key={u}>{u}</li>)
						: <li style={{ listStyle: 'none', opacity: 0.7 }}>（まだメンバーがいません）</li>}
				</Box>
			</Box>

			{/* 10分以内の名前のリスト（既存） */}
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
				<Typography sx={{ mt: 1 }} color={readyState === 'error' ? 'error' : 'primary'}>
					{readyMsg}
				</Typography>
			)}
		</Box>
	);
};

export default Standby;
