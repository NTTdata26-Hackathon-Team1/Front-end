import React, { useEffect, useRef, useState } from 'react';
import { Typography, Box, CircularProgress } from '@mui/material';
import { supabase } from './supabaseClient';
import { useNavigate } from 'react-router-dom';

const POLL_MS_ACTIVE = 2000;
const POLL_MS_HIDDEN = 8000;

type ReadyResp = { ok: boolean; ready: boolean };
type GetRoundResp = { ok: boolean; round?: number; error?: string };

const ChildWaiting: React.FC = () => {
    const [errMsg, setErrMsg] = useState<string | null>(null);

    // ラウンド表示用
    const [round, setRound] = useState<number | null>(null);
    const [roundLoading, setRoundLoading] = useState<boolean>(false);

    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const inFlightRef = useRef(false);
    const cancelledRef = useRef(false);
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
            const { data, error } = await supabase.functions.invoke<ReadyResp>(
                'polling-api',
                {
                    body: {
                        method: 'is-topic-ready',
                        params: { tab_id: sessionStorage.getItem('tab_id') ?? '' },
                    },
                }
            );

            if (cancelledRef.current || routedRef.current) return;

            if (error) {
                setErrMsg(error.message ?? 'polling-api error');
            } else if (data?.ok && data.ready) {
                routedRef.current = true;
                if (timerRef.current) clearTimeout(timerRef.current);
                navigate('/childanswer');
                return;
            }
        } catch (e: any) {
            if (!cancelledRef.current) setErrMsg(e?.message ?? 'unknown error');
        } finally {
            inFlightRef.current = false;
            if (!cancelledRef.current && !routedRef.current) scheduleNext();
        }
    };

    // 画面起動時：round を取得して左上に表示
    const fetchRound = async () => {
        const tab_id = sessionStorage.getItem('tab_id') ?? '';
        if (!tab_id) {
            setErrMsg('tab_id が見つかりません（前画面での保存を確認してください）');
            return;
        }
        setRoundLoading(true);
        try {
            const { data, error } = await supabase.functions.invoke<GetRoundResp>(
                'main-api',
                {
                    body: { method: 'get-round', params: { tab_id } },
                }
            );
            if (error) {
                setErrMsg(error.message ?? 'get-round の呼び出しに失敗しました');
            } else if (!data?.ok || typeof data.round !== 'number') {
                setErrMsg(data?.error ?? 'round の取得に失敗しました');
            } else {
                setRound(data.round);
            }
        } catch (e: any) {
            setErrMsg(e?.message ?? 'round の取得に失敗しました（unknown error）');
        } finally {
            setRoundLoading(false);
        }
    };

    useEffect(() => {
        cancelledRef.current = false;
        fetchRound(); // ラウンド表示の初期化
        pollOnce();   // 親のお題準備完了のポーリング開始

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
        <Box
            display="flex"
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
            mt={8}
            sx={{ position: 'relative', width: '100%' }}
        >
            {/* 左上のラウンド表示 */}
            <Box sx={{ position: 'absolute', top: 8, left: 12 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                    第 {roundLoading ? '…' : (round ?? '—')} ターン
                </Typography>
            </Box>

            <Typography variant="h4" gutterBottom>
                お題の入力を待っています
            </Typography>
            <Typography variant="subtitle1" gutterBottom>
                親が入力中です…
            </Typography>
            <CircularProgress size={80} />
            {errMsg && (
                <Typography color="error" sx={{ mt: 2 }}>
                    {errMsg}
                </Typography>
            )}
        </Box>
    );
};

export default ChildWaiting;
