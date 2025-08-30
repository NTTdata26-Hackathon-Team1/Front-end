import React, { useState } from 'react';
import { Typography, TextField, Button, Box } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient'; // ★ supabaseクライアントをimport

const ParentTopicPage: React.FC = () => {
    const [topic, setTopic] = useState('');
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!topic.trim()) return;

        try {
            // ★ Edge Functionに送信
            const { data, error } = await supabase.functions.invoke('submit-topic', {
                body: { topic: topic.trim() },
            });

            if (error) {
                console.error('送信エラー:', error.message);
                return;
            }

            console.log("送信成功:", data);

            // ★ 成功したら次の画面に遷移（必要に応じてdataも渡せる）
            navigate('/nextpage', { state: { topic: topic.trim() } });
        } catch (err) {
            console.error('予期せぬエラー:', err);
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
                    disabled={!topic.trim()} 
                    color="primary"
                >
                    送信
                </Button>
            </Box>
        </Box>
    );
};

export default ParentTopicPage;
