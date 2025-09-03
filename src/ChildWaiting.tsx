import React, { useEffect, useRef, useState } from 'react';
import { Typography, Box, CircularProgress } from '@mui/material';
import { supabase } from './supabaseClient';
import { useNavigate } from 'react-router-dom';

const POLL_MS_ACTIVE = 2000;
const POLL_MS_HIDDEN = 8000;

type ReadyResp = { ok: boolean; ready: boolean };

const ChildWaiting: React.FC = () => {
    const [errMsg, setErrMsg] = useState<string | null>(null);
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
            const { data, error } = await supabase.functions.invoke<ReadyResp>('clever-handler', {
                body: { method: 'is-topic-ready', params: { tab_id: sessionStorage.getItem("tab_id") ?? "" } }
            });

            if (cancelledRef.current || routedRef.current) return;

            if (error) {
                setErrMsg(error.message ?? 'Edge Function error');
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
        <Box
            display="flex"
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
            mt={8}
        >
            <Typography variant="h4" gutterBottom>
                お題の入力を待っています
            </Typography>
            <Typography variant="subtitle1" gutterBottom>
                親が入力中です…
            </Typography>
            <CircularProgress size={80} />
            {errMsg && (
                <Typography color="error" sx={{ mt: 2 }}>{errMsg}</Typography>
            )}
        </Box>
    );
};

export default ChildWaiting;

