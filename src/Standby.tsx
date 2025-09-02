import React, { useEffect, useRef, useState } from 'react';
import { Box, Typography, Button } from '@mui/material';
import { supabase } from './supabaseClient';
import { useNavigate } from 'react-router-dom';

type UsernameRow = { user_name: string };

type DecideRouteResp = {
	ok: boolean;
	matched: boolean;
	to?: string;
	now_host?: boolean;
	round?: number;
	room_name?: string;
	n?: number;
	N?: number;
	counts?: { a: number; b: number };
	reason?: string;
	error?: string;
};

type RoomInfoByTabResp = {
	ok: boolean;
	room_name: string | null;
	num_of_r: number | null;
	members: string[];
	num_of_s: number;
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
	const [usernames, setUsernames] = useState<string[]>([]);

	const [myRoomName, setMyRoomName] = useState<string | null>(null);
	const [myNumOfR, setMyNumOfR] = useState<number | null>(null);
	const [roomUsernames, setRoomUsernames] = useState<string[]>([]);
	const [roomCount, setRoomCount] = useState<number>(0);

	const [readyState, setReadyState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
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

			// 1) 最近ユーザー
			const { data: usersData, error: usersErr } =
				await supabase.functions.invoke<UsernameRow[]>('dynamic-api', {
					body: { method: 'send-username-list' },
				});
			if (cancelledRef.current || routedRef.current) return;

			if (!usersErr) {
				const names =
					(usersData ?? [])
						.filter((row): row is UsernameRow => !!row && typeof (row as any).user_name === 'string')
						.map((row) => row.user_name);
				setUsernames((prev) => (arraysEqual(prev, names) ? prev : names));
			} else {
				setErrMsg((prev) => prev ?? (usersErr.message || 'failed: send-username-list'));
			}

			// 1.5) 自部屋情報
			if (myTab) {
				const { data: infoData, error: infoErr } =
					await supabase.functions.invoke<RoomInfoByTabResp>('dynamic-api', {
						body: { method: 'get-tab-room-info', params: { tab_id: myTab } },
					});
				if (cancelledRef.current || routedRef.current) return;

				if (infoErr) {
					setErrMsg((prev) => prev ?? (infoErr.message || 'failed: get-tab-room-info'));
				} else if (!infoData?.ok) {
					setErrMsg((prev) => prev ?? (infoData?.error || 'get-tab-room-info error'));
					setMyRoomName(null); setMyNumOfR(null); setRoomUsernames([]); setRoomCount(0);
				} else {
					setMyRoomName(infoData.room_name ?? null);
					setMyNumOfR(typeof infoData.num_of_r === 'number' ? infoData.num_of_r : null);
					setRoomUsernames((prev) => arraysEqual(prev, infoData.members ?? []) ? prev : (infoData.members ?? []));
					setRoomCount(typeof infoData.num_of_s === 'number' ? infoData.num_of_s : 0);
				}
			}

			// 2) ルーティング判定（tab_id を渡す）
			if (myTab) {
				const { data: routeData, error: routeErr } =
					await supabase.functions.invoke<DecideRouteResp>('dynamic-api', {
						body: { method: 'decide-and-route', params: { tab_id: myTab } },
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

	// 準備完了 → dynamic-api に tab_id のみ送る（即 decide-and-route は呼ばない）
	const handleReadyClick = async () => {
		if (readyState === 'sending' || readyState === 'done') return;
		setReadyState('sending'); setReadyMsg(null);

		const tab_id = getTabIdFromSession();
		if (!tab_id) {
			setReadyState('error');
			setReadyMsg('tab_id が見つかりません（前ページでの保存を確認）');
			return;
		}

		try {
			const { data, error } = await supabase.functions.invoke<MarkReadyResp>('dynamic-api', {
				body: { method: 'mark-ready', params: { tab_id } },
			});
			if (error) {
				setReadyState('error'); setReadyMsg(error.message ?? '準備完了の記録に失敗しました');
			} else if (!data?.ok) {
				setReadyState('error'); setReadyMsg(data?.error ?? '準備完了の記録に失敗しました');
			} else {
				setReadyState('done'); setReadyMsg('準備完了を記録しました');
			}
		} catch (e: any) {
			setReadyState('error'); setReadyMsg(e?.message ?? '準備完了の記録に失敗しました（unknown error）');
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
			<Typography variant="h2" component="h1" gutterBottom>朝までそれ正解</Typography>

			{errMsg && <Typography color="error" sx={{ mt: 1 }}>{errMsg}</Typography>}

			<Box mt={3} width={520} p={2} border="1px solid #888" borderRadius={2} bgcolor="#f7f7f7">
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

			<Box mt={4} mb={4} width={400} height={300} display="flex" flexDirection="column" alignItems="center" justifyContent="center" bgcolor="#ccc" border="1px solid #888">
				<Typography variant="h5" component="div" fontStyle="italic" mb={2}>10分以内の名前のリスト</Typography>
				<Box component="ul" sx={{ listStyle: 'disc', pl: 4, fontSize: '1.5rem', fontStyle: 'italic', m: 0 }}>
					{usernames.length > 0 ? usernames.map((name) => <li key={name}>{name}</li>)
						: <li style={{ listStyle: 'none', fontStyle: 'normal', opacity: 0.8 }}>（10分以内のユーザーなし）</li>}
				</Box>
			</Box>

			<Button variant="outlined" sx={{ width: 120, fontSize: '1.2rem' }} onClick={handleReadyClick} disabled={readyState === 'sending' || readyState === 'done'}>
				{readyState === 'sending' ? '送信中…' : readyState === 'done' ? '送信済み' : '準備完了'}
			</Button>

			{readyMsg && <Typography sx={{ mt: 1 }} color={readyState === 'error' ? 'error' : 'primary'}>{readyMsg}</Typography>}
		</Box>
	);
};

export default Standby;
