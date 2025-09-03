import React, { useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import { useNavigate } from 'react-router-dom';
import './Standby.css';

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
		<div className="standby-bg">
			{/* 塔と木（左右） */}
			<img src="/pixel_tower.png" alt="tower" className="standby-tower-left" />
			<img src="/pixel_tower.png" alt="tower" className="standby-tower-right" />
			<img src="/pixel_tree.png" alt="tree" className="standby-tree-left" />
			<img src="/pixel_tree.png" alt="tree" className="standby-tree-right" />

			{/* 雲（個別配置） */}
			<img src="/pixel_cloud_transparent.png" alt="cloud" className="standby-cloud left" />
			<img src="/pixel_cloud_transparent.png" alt="cloud" className="standby-cloud right" />
			<img src="/pixel_cloud_transparent.png" alt="cloud" className="standby-cloud center1" />
			<img src="/pixel_cloud_transparent.png" alt="cloud" className="standby-cloud center2" />

			{/* タイトル・サブタイトル */}
			<h1 className="standby-title">朝までそれ正解</h1>
			<h2 className="standby-subtitle">ASAMADESORE SEIKAI</h2>

			{/* エラー表示 */}
			{errMsg && (
				<div style={{ color: '#ff3333', marginTop: '1vw', textAlign: 'center', fontWeight: 'bold' }}>{errMsg}</div>
			)}

			{/* 中央の枠（ユーザーリスト） */}
			<div className="standby-center-box">
				<ul className="standby-user-list">
					{usernames.length > 0 ? (
						usernames.map((name) => <li key={name}>{name}</li>)
					) : (
						<li className="standby-no-user" style={{ opacity: 0.8 }}>
							（10分以内のユーザーなし）
						</li>
					)}
				</ul>
			</div>

			{/* スタートボタン（準備完了） */}
			<button
				className="standby-start-btn"
				onClick={handleReadyClick}
				disabled={readyState === 'sending' || readyState === 'done'}
			>
				{readyState === 'sending' ? '送信中…' : readyState === 'done' ? '送信済み' : 'REDY'}
			</button>

			{/* 準備完了メッセージ */}
			{readyMsg && (
				<div className="standby-ready-msg" style={{ color: readyState === 'error' ? '#ff3333' : '#1e9c52' }}>
					{readyMsg}
				</div>
			)}

			{/* 地面風 */}
			<div className="standby-ground"></div>
		</div>
	);
};

export default Standby;


