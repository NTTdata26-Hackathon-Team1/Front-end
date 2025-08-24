import React, { useState } from 'react';
import { Typography, TextField, Button, Box } from '@mui/material';
import { useNavigate } from 'react-router-dom';

const ParentTopicPage: React.FC = () => {
    const [topic, setTopic] = useState('');
    const navigate = useNavigate();

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        console.log("送信されたお題:", topic);
        // 後でここで次の画面に遷移させる
        // navigate('/nextpage'); ← 後から追加
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
