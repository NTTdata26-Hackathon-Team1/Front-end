import React, { useEffect, useRef, useState } from 'react';
import { Typography, Box, CircularProgress } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';

const POLL_MS = 2000; // 2秒おきに確認

// ★ 追加: tab_id の取得ヘルパー（localStorage → sessionStorage → URL ?tab_id=）
function resolveTabId(): string | null {
    try {
        const ls = window.localStorage.getItem('tab_id') ?? window.localStorage.getItem('tabId');
        if (ls && ls.trim()) return ls.trim();

        const ss = window.sessionStorage.getItem('tab_id') ?? window.sessionStorage.getItem('tabId');
        if (ss && ss.trim()) return ss.trim();

        const q = new URLSearchParams(window.location.search);
        const fromQuery = (q.get('tab_id') ?? q.get('tabId'))?.trim() || '';
        if (fromQuery) return fromQuery;

        return null;
    } catch {
        return null;
    }
}

const ParentWaiting: React.FC = () => {
    const navigate = useNavigate();
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const inFlightRef = useRef(false);
    const cancelledRef = useRef(false);
    const routedRef = useRef(false); // 遷移したらポーリング停止
    const tabIdRef = useRef<string | null>(null); // ★ 追加: tab_id を保持

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
            const tab_id = tabIdRef.current;
            if (!tab_id) {
                setErrorMsg('tab_id が見つかりませんでした（local/sessionStorage または URL の ?tab_id= を確認してください）');
                return;
            }

            // ★ 変更: are-children-answers-complete 呼び出し時に tab_id を渡す
            const { data, error } = await supabase.functions.invoke<{
                ok: boolean;
                ready?: boolean;
                a?: number;
                b?: number;
            }>('clever-handler', {
                body: { method: 'are-children-answers-complete', tab_id },
            });

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
        tabIdRef.current = resolveTabId(); // ★ 追加: 初回に tab_id を確定
        // 初回即実行
        pollOnce();

        return () => {
            cancelledRef.current = true;
            if (timerRef.current) clearTimeout(timerRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" mt={8}>
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
