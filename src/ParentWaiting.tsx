import React, { useEffect, useRef, useState } from 'react';
import { Typography, Box, CircularProgress } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';

const POLL_MS = 2000; // 2秒おきに確認

const ParentWaiting: React.FC = () => {
    const navigate = useNavigate();
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const inFlightRef = useRef(false);
    const cancelledRef = useRef(false);
    const routedRef = useRef(false); // 遷移したらポーリング停止

    const scheduleNext = () => {
        if (cancelledRef.current || routedRef.current) return;
        timerRef.current = setTimeout(pollOnce, POLL_MS);
    };

    const pollOnce = async () => {
        if (cancelledRef.current || inFlightRef.current || routedRef.current) {
            scheduleNext();
            return;
        }
        inFlightRef.current = true;
        setErrorMsg(null);

        try {
            const { data, error } = await supabase.functions.invoke<{ ok: boolean; ready?: boolean }>(
                'clever-handler',
                { body: { method: 'are-children-answers-complete' } } // 引数なし
            );

            if (error) {
                setErrorMsg(error.message ?? '確認中にエラーが発生しました');
            } else if (data?.ok && data.ready) {
                // すべての子回答が揃った → 次のページへ
                routedRef.current = true;
                if (timerRef.current) clearTimeout(timerRef.current);
                navigate('/parentselectanswer');
                return;
            }
        } catch (e: any) {
            setErrorMsg(e?.message ?? '確認中にエラーが発生しました（unknown error）');
        } finally {
            inFlightRef.current = false;
            scheduleNext();
        }
    };

    useEffect(() => {
        cancelledRef.current = false;
        // 初回即実行
        pollOnce();

        return () => {
            cancelledRef.current = true;
            if (timerRef.current) clearTimeout(timerRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <Box
            display="flex"
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
            mt={8}
        >
            <Typography variant="h4" gutterBottom>
                回答入力中です
            </Typography>

            <CircularProgress size={80} />

            {errorMsg && (
                <Typography color="error" sx={{ mt: 2 }}>
                    {errorMsg}
                </Typography>
            )}
        </Box>
    );
};

export default ParentWaiting;
