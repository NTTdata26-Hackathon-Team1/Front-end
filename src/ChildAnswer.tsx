import React, { useEffect, useState } from 'react';
import { Typography, TextField, Button, Box } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';

// sessionStorage から取得（TopMenu で保存済み想定）
const getTabId = () => sessionStorage.getItem('tab_id') ?? '';

const ChildAnswer: React.FC = () => {
    const [topic, setTopic] = useState<string | null>(null); // 取得したお題
    const [answer, setAnswer] = useState('');
    const [sending, setSending] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // お題のロード状態
    const [loadingTopic, setLoadingTopic] = useState(true);

    // ラウンド表示用
    const [round, setRound] = useState<number | null>(null);
    const [roundLoading, setRoundLoading] = useState<boolean>(false);

    const navigate = useNavigate();

    // 起動時にお題＆ラウンドを取得（main-api）
    useEffect(() => {
        let cancelled = false;
        const tab_id = getTabId();

        if (!tab_id) {
            setErrorMsg('tab_id が見つかりません（前画面での保存を確認してください）');
            setLoadingTopic(false);
            setRoundLoading(false);
            return () => { cancelled = true; };
        }

        // ラウンド
        (async () => {
            setRoundLoading(true);
            try {
                const { data, error } = await supabase.functions.invoke<{
                    ok: boolean;
                    round?: number;
                    error?: string;
                }>('main-api', {
                    body: { action: 'get-round', params: { tab_id } },
                });
                if (cancelled) return;

                if (error) {
                    setErrorMsg(error.message ?? 'ラウンド情報の取得に失敗しました');
                } else if (!data?.ok || typeof data.round !== 'number') {
                    setErrorMsg(data?.error ?? 'ラウンド情報の取得に失敗しました');
                } else {
                    setRound(data.round);
                }
            } catch (e: any) {
                if (!cancelled) setErrorMsg(e?.message ?? 'ラウンド情報の取得に失敗しました（unknown error）');
            } finally {
                if (!cancelled) setRoundLoading(false);
            }
        })();

        // お題
        (async () => {
            setLoadingTopic(true);
            try {
                const { data, error } = await supabase.functions.invoke<{
                    ok: boolean;
                    topic?: string | null;
                    error?: string;
                }>('main-api', {
                    body: { action: 'get-current-topic', params: { tab_id } },
                });
                if (cancelled) return;

                if (error) {
                    setErrorMsg(error.message ?? 'お題の取得に失敗しました');
                } else if (!data?.ok) {
                    setErrorMsg(data?.error ?? 'お題の取得に失敗しました');
                } else {
                    setTopic(typeof data.topic === 'string' && data.topic.length > 0 ? data.topic : null);
                }
            } catch (e: any) {
                if (!cancelled) setErrorMsg(e?.message ?? 'お題の取得に失敗しました（unknown error）');
            } finally {
                if (!cancelled) setLoadingTopic(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!answer.trim() || sending) return;

        const tab_id = getTabId();
        if (!tab_id) {
            setErrorMsg('tab_id が見つかりません（前画面での保存を確認してください）');
            return;
        }

        setSending(true);
        setErrorMsg(null);

        try {
            // main-api: submit-answer（tab_id と txt のみ）
            const { data, error } = await supabase.functions.invoke<{
                ok: boolean;
                row?: any;
                updated?: boolean;
                error?: string;
            }>('main-api', {
                body: {
                    action: 'submit-answer',
                    params: {
                        tab_id,
                        txt: answer.trim(),
                    },
                },
            });

            if (error) {
                setErrorMsg(error.message ?? '送信に失敗しました');
            } else if (!data?.ok) {
                setErrorMsg(data?.error ?? '送信に失敗しました');
            } else {
                // ✅ 送信成功時に一覧ページへ
                navigate('/childanswerlist');
            }
        } catch (err: any) {
            setErrorMsg(err?.message ?? '送信エラー');
        } finally {
            setSending(false);
        }
    };

    return (
        <Box
            display="flex"
            flexDirection="column"
            alignItems="center"
            mt={8}
            sx={{ position: 'relative', width: '100%' }}
        >
            {/* 左上：ラウンド表示 */}
            <Box sx={{ position: 'absolute', top: 8, left: 12 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                    第 {roundLoading ? '…' : (round ?? '—')} ターン
                </Typography>
            </Box>

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
                    onChange={(e) => setAnswer(e.target.value)}
                />
                <Button
                    type="submit"
                    variant="contained"
                    disabled={!answer.trim() || sending}
                    color="primary"
                >
                    {sending ? '送信中…' : '送信'}
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

