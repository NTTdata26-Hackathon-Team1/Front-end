import React, { useEffect, useRef, useState } from 'react';
import './Standby.css';

import { supabase } from './supabaseClient';
import { useNavigate } from 'react-router-dom';
import DanmakuInput from './DanmakuInput';

type DecideRouteResp = {
	ok: boolean;
	matched: boolean;
	to?: string;
	finished?: boolean;   // /lastanswer 遷移時に true が来る想定
	now_host?: boolean;
	round?: number;
	room_name?: string;
	n?: number;
	N?: number;
	counts?: { a: number; b: number };
	reason?: string;
	error?: string;
};

// polling-api の get-room-info の戻り値型
type RoomInfoResp = {
	ok: boolean;
	room_name: string | null;
	num_of_rounds: number | null;
	members: string[];
	num_of_nowusers: number; // 人数
	error?: string;
};

type MarkReadyResp = {
	ok: boolean;
	row?: any;
	error?: string;
};

const POLL_MS_ACTIVE = 3000;
const POLL_MS_HIDDEN = 15000;

function arraysEqual(a: string[], b: string[]) {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
	return true;
}
const getTabIdFromSession = () => sessionStorage.getItem('tab_id') ?? null;

const Standby: React.FC = () => {
	const [errMsg, setErrMsg] = useState<string | null>(null);

	const [myRoomName, setMyRoomName] = useState<string | null>(null);
	const [myNumOfR, setMyNumOfR] = useState<number | null>(null); // 表示上は round数
	const [roomUsernames, setRoomUsernames] = useState<string[]>([]);
	const [num_of_nowusers, setNumOfNowUsers] = useState<number>(0);

	const [readyState, setReadyState] =
		useState<'idle' | 'sending' | 'done' | 'error'>('idle');
	const [readyMsg, setReadyMsg] = useState<string | null>(null);

	const cancelledRef = useRef(false);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const inFlightRef = useRef(false);
	const routedRef = useRef(false);

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

			// 自部屋情報（polling-api / get-room-info）
			if (myTab) {
				const { data: infoData, error: infoErr } =
					await supabase.functions.invoke<RoomInfoResp>('polling-api', {
						body: { action: 'get-room-info', tab_id: myTab },
					});
				if (cancelledRef.current || routedRef.current) return;

				if (infoErr) {
					setErrMsg((prev) => prev ?? (infoErr.message || 'failed: get-room-info'));
				} else if (!infoData?.ok) {
					setErrMsg((prev) => prev ?? (infoData?.error || 'get-room-info error'));
					setMyRoomName(null);
					setMyNumOfR(null);
					setRoomUsernames([]);
					setNumOfNowUsers(0);
				} else {
					setMyRoomName(infoData.room_name ?? null);
					setMyNumOfR(
						typeof infoData.num_of_rounds === 'number' ? infoData.num_of_rounds : null
					);
					setRoomUsernames((prev) =>
						arraysEqual(prev, infoData.members ?? []) ? prev : (infoData.members ?? [])
					);
					setNumOfNowUsers(
						typeof infoData.num_of_nowusers === 'number' ? infoData.num_of_nowusers : 0
					);
				}
			}

			// ルーティング判定（main-api / decide-and-route）
			if (myTab) {
				const { data: routeData, error: routeErr } =
					await supabase.functions.invoke<DecideRouteResp>('polling-api', {
						body: { action: 'decide-and-route', tab_id: myTab },
					});
				if (cancelledRef.current || routedRef.current) return;

				if (routeErr) {
					setErrMsg((prev) => prev ?? (routeErr.message || 'failed: decide-and-route'));
				} else if (routeData?.ok && routeData.matched && routeData.to) {
					routedRef.current = true;
					if (timerRef.current) clearTimeout(timerRef.current);
					navigate(routeData.to);
					return;
				}
			}
		} catch (e: any) {
			if (!cancelledRef.current) setErrMsg(e?.message ?? 'unknown error');
		} finally {
			inFlightRef.current = false;
			if (!cancelledRef.current && !routedRef.current) scheduleNext();
		}
	};

	// 準備完了 → only-once-api に tab_id を送る
	const handleReadyClick = async () => {
		if (readyState === 'sending' || readyState === 'done') return;
		setReadyState('sending');
		setReadyMsg(null);

		const tab_id = getTabIdFromSession();
		if (!tab_id) {
			setReadyState('error');
			setReadyMsg('tab_id が見つかりません（前ページでの保存を確認）');
			return;
		}

		try {
			const { data, error } = await supabase.functions.invoke<MarkReadyResp>('only-once-api', {
				body: { action: 'mark-ready', tab_id }, // ← params ではなくトップレベルで送る
			});
			if (error) {
				setReadyState('error');
				setReadyMsg(error.message ?? '準備完了の記録に失敗しました');
			} else if (!data?.ok) {
				setReadyState('error');
				setReadyMsg(data?.error ?? '準備完了の記録に失敗しました');
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
		pollOnce();

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
			{/* 雲・塔・木 */}
			<img src="/pixel_cloud_transparent.png" className="cloud-img cloud-left-up" alt="cloud" />
			<img src="/pixel_cloud_transparent.png" className="cloud-img cloud-right-up" alt="cloud" />
			<img src="/pixel_tower.png" className="tower-img tower-left" alt="tower" />
			<img src="/pixel_tower.png" className="tower-img tower-right" alt="tower" />
			<img src="/pixel_tree.png" className="tree-img tree-left" alt="tree" />
			<img src="/pixel_tree.png" className="tree-img tree-right" alt="tree" />

			{/* タイトル・サブタイトル */}
			<h1 className="standby-title"
			style={{
                textShadow: "0 4px 24px #f52ba7ff, 0 1px 0 #f645bbff",
                fontWeight: 900,
                color: "#fcfbfbff",
            }}>朝までそれ正解</h1>

			{/* 中央の緑枠 */}
			<div className="center-box">
				{errMsg && <div style={{ color: '#ff69b4', marginBottom: 8 }}>{errMsg}</div>}
				<div style={{ fontWeight: 'bold', fontSize: '1.2rem', marginBottom: 10 }}>現在の部屋情報</div>
				<div>room name: <b>{myRoomName ?? '—'}</b></div>
				<div>round数: <b>{myNumOfR ?? '—'}</b></div>
				<div>この部屋の人数: <b>{num_of_nowusers}</b></div>
				<div style={{ marginTop: 8 }}>この部屋のメンバー:</div>
				<ul style={{ listStyle: 'disc', paddingLeft: 24, margin: 0, textAlign: 'center' }}>
					{(roomUsernames && roomUsernames.length > 0)
						? roomUsernames.map((u) => <li key={u}>{u}</li>)
						: <li style={{ listStyle: 'none', opacity: 0.7 }}>（まだメンバーがいません）</li>}
				</ul>
				<button
					className="standby-btn"
					onClick={handleReadyClick}
					disabled={readyState === 'sending' || readyState === 'done'}
					style={{ marginTop: 24 }}
				>
					{readyState === 'sending' ? '送信中…' : readyState === 'done' ? '送信済み' : '準備完了'}
				</button>
				{readyMsg && (
					<div style={{ marginTop: 8, color: readyState === 'error' ? '#ff69b4' : '#1fa32b' }}>
						{readyMsg}
					</div>
				)}
			</div>
            <DanmakuInput fixedBottom />
			
		</div>
	);
};

export default Standby;

