import React, { useEffect, useState } from 'react';
import { Typography, TextField, Button, Box } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';

// sessionStorage から取得（TopMenu で保存済み想定）
const getTabId = () => sessionStorage.getItem("tab_id") ?? "";
const getUserName = () => sessionStorage.getItem("user_name") ?? "";

const ChildAnswer: React.FC = () => {
    const [topic, setTopic] = useState<string | null>(null);     // 取得したお題
    const [answer, setAnswer] = useState('');
    const [sending, setSending] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [loadingTopic, setLoadingTopic] = useState(true);

    const navigate = useNavigate();

    // 起動時にお題を取得
    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoadingTopic(true);
            setErrorMsg(null);
            try {
                const { data, error } = await supabase.functions.invoke<{ ok: boolean; topic?: string }>('clever-handler', {
                    body: { method: 'get-current-topic' },   // 引数なし
                });
                if (cancelled) return;

                if (error) {
                    setErrorMsg(error.message ?? 'お題の取得に失敗しました');
                } else if (data?.ok && typeof data.topic === 'string' && data.topic.length > 0) {
                    setTopic(data.topic);
                } else {
                    // お題がまだ用意されていない場合
                    setTopic(null);
                }
            } catch (e: any) {
                if (!cancelled) setErrorMsg(e?.message ?? 'お題の取得に失敗しました（unknown error）');
            } finally {
                if (!cancelled) setLoadingTopic(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!answer.trim() || sending) return;

        setSending(true);
        setErrorMsg(null);

        try {
            const { data, error } = await supabase.functions.invoke('clever-handler', {
                body: {
                    method: 'submit-answer',
                    params: {
                        txt: answer.trim(),
                        tab_id: getTabId(),
                        user_name: getUserName(),
                    },
                },
            });

            if (error) {
                console.error("Edge Function Error:", error);
                setErrorMsg(error.message ?? "送信に失敗しました");
            } else {
                console.log("送信成功:", data);
                // ✅ 送信成功時に一覧ページへ
                navigate('/childanswerlist');
            }
        } catch (err: any) {
            console.error("invoke error:", err);
            setErrorMsg(err?.message ?? "送信エラー");
        } finally {
            setSending(false);
        }
    };

    return (
        <Box display="flex" flexDirection="column" alignItems="center" mt={8}>
            <Typography variant="h4" component="h1" gutterBottom>
                {loadingTopic
                    ? 'お題を取得中…'
                    : topic
                        ? <>お題は 「{topic}」 です</>
                        : 'お題は未設定です'}
            </Typography>

            <Typography variant="subtitle1" gutterBottom>
                回答してください
            </Typography>

            <Box
                component="form"
                onSubmit={handleSubmit}
                display="flex"
                alignItems="center"
                gap={2}
                mt={4}
            >
                <TextField
                    label="解答入力欄"
                    variant="outlined"
                    value={answer}
                    onChange={e => setAnswer(e.target.value)}
                />
                <Button
                    type="submit"
                    variant="contained"
                    disabled={!answer.trim() || sending}
                    color="primary"
                >
                    {sending ? "送信中…" : "送信"}
                </Button>
            </Box>

            {errorMsg && (
                <Typography color="error" sx={{ mt: 2 }}>
                    {errorMsg}
                </Typography>
            )}
        </Box>
    );
};

export default ChildAnswer;

