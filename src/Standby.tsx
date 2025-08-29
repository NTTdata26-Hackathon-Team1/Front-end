import React, { useEffect, useRef, useState } from 'react';
import { Box, Typography, Button } from '@mui/material';
import { supabase } from './supabaseClient';

type UsernameRow = { user_name: string };

const POLL_MS_ACTIVE = 3000;  // タブが見えている間のポーリング間隔
const POLL_MS_HIDDEN = 15000; // タブが非表示のときの間隔（負荷軽減）

function arraysEqual(a: string[], b: string[]) {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
	return true;
}

const Standby: React.FC = () => {
	const [calling, setCalling] = useState(false);
	const [errMsg, setErrMsg] = useState<string | null>(null);
	const [usernames, setUsernames] = useState<string[]>([]);
	const cancelledRef = useRef(false);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const inFlightRef = useRef(false); // 競合防止：前回の呼び出しが終わるまで次を送らない

	const scheduleNext = () => {
		if (cancelledRef.current) return;
		const interval = document.hidden ? POLL_MS_HIDDEN : POLL_MS_ACTIVE;
		timerRef.current = setTimeout(pollOnce, interval);
	};

	const pollOnce = async () => {
		if (cancelledRef.current || inFlightRef.current) {
			scheduleNext();
			return;
		}
		inFlightRef.current = true;
		// setCalling(true);   // {calling && <Typography>更新確認中…</Typography>}と一緒に使う
		setErrMsg(null);

		try {
			const { data, error } = await supabase.functions.invoke<UsernameRow[]>('dynamic-api', {
				body: { method: "send-username-list" }
			});
			if (cancelledRef.current) return;

			if (error) {
				setErrMsg(error.message ?? 'Edge Function calling : failed');
			} else {
				const names =
					(data ?? [])
						.filter((row): row is UsernameRow => !!row && typeof (row as any).user_name === 'string')
						.map((row) => row.user_name);

				// 変化があるときだけ更新（無駄な再描画を抑制）
				setUsernames((prev) => (arraysEqual(prev, names) ? prev : names));
			}
		} catch (e: any) {
			if (!cancelledRef.current) setErrMsg(e?.message ?? 'unknown error');
		} finally {
			inFlightRef.current = false;
			if (!cancelledRef.current) {
				// setCalling(false); // {calling && <Typography>更新確認中…</Typography>} と一緒に使う
				scheduleNext();
			}
		}
	};

	useEffect(() => {
		cancelledRef.current = false;

		// 初回即時実行
		pollOnce();

		// タブの可視状態が変わったときに即ポーリングを1回走らせる（復帰を早める）
		const onVis = () => {
			if (!cancelledRef.current) {
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

			{/* {calling && <Typography>更新確認中…</Typography>}  これ、画面揺れるのでコメントアウト */}
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

			<Button variant="outlined" sx={{ width: 120, fontSize: '1.2rem' }}>
				準備完了
			</Button>
		</Box>
	);
};

export default Standby;
