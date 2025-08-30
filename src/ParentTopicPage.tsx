import React, { useState } from 'react';
import { Typography, TextField, Button, Box } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';

// sessionStorage から引き継ぎ
const getTabId = () => sessionStorage.getItem('tab_id') ?? '';
const getUserName = () => sessionStorage.getItem('user_name') ?? '';

const ParentTopicPage: React.FC = () => {
    const [topic, setTopic] = useState('');
    const [sending, setSending] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const txt = topic.trim();
        if (!txt || sending) return;

        const tab_id = getTabId();
        const user_name = getUserName();

        if (!tab_id || !user_name) {
            setErr('tab_id もしくは user_name が見つかりません（前画面での保存を確認してください）');
            return;
        }

        setSending(true);
        setErr(null);

        try {
            // Edge Function: clever-handler を呼ぶ
            const { data, error } = await supabase.functions.invoke('clever-handler', {
                body: {
                    method: "submit-topic",
                    // 単純化："txt" と一緒に tab_id / user_name も渡す
                    txt,
                    tab_id,
                    user_name,
                },
            });

            if (error) {
                setErr(error.message ?? '送信に失敗しました');
                setSending(false);
                return;
            }

            // 成功したら次の画面へ（お好みで変更）
            navigate('/parentwaiting', { state: { topic: txt } });
        } catch (e: any) {
            setErr(e?.message ?? '予期せぬエラーが発生しました');
            setSending(false);
        }
    };

    return (
        <Box display="flex" flexDirection="column" alignItems="center" mt={8}>
            <Typography variant="h4" component="h1" gutterBottom>
                あなたは親です
            </Typography>
            <Typography variant="subtitle1" gutterBottom>
                お題を入力してください
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
                    label="お題入力欄"
                    variant="outlined"
                    value={topic}
                    onChange={e => setTopic(e.target.value)}
                />
                <Button
                    type="submit"
                    variant="contained"
                    disabled={!topic.trim() || sending}
                    color="primary"
                >
                    {sending ? '送信中…' : '送信'}
                </Button>
            </Box>

            {err && (
                <Typography color="error" sx={{ mt: 2 }}>
                    {err}
                </Typography>
            )}
        </Box>
    );
};

export default ParentTopicPage;
