import React, { useEffect, useRef, useState } from 'react';
import { Box, Typography, Button } from '@mui/material';
import { supabase } from './supabaseClient';
import { useNavigate } from 'react-router-dom';

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
		<Box display="flex" flexDirection="column" alignItems="center" mt={8}>
			<Typography variant="h2" component="h1" gutterBottom>
				朝までそれ正解
			</Typography>

			{errMsg && <Typography color="error" sx={{ mt: 1 }}>{errMsg}</Typography>}

			<Box mt={3} width={520} p={2} border="1px solid #888" borderRadius={2} bgcolor="#f7f7f7">
				<Typography variant="h6" gutterBottom>現在の部屋情報</Typography>
				<Typography>room name: <b>{myRoomName ?? '—'}</b></Typography>
				<Typography>round数: <b>{myNumOfR ?? '—'}</b></Typography>
				<Typography>この部屋の人数: <b>{num_of_nowusers}</b></Typography>
				<Typography sx={{ mt: 1 }}>この部屋のメンバー:</Typography>
				<Box component="ul" sx={{ listStyle: 'disc', pl: 4, m: 0 }}>
					{(roomUsernames && roomUsernames.length > 0)
						? roomUsernames.map((u) => <li key={u}>{u}</li>)
						: <li style={{ listStyle: 'none', opacity: 0.7 }}>（まだメンバーがいません）</li>}
				</Box>
			</Box>

			<Button
				variant="outlined"
				sx={{ width: 120, fontSize: '1.2rem', mt: 4 }}
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

