import React, { useState } from 'react';
import { Typography, TextField, Button, Box } from '@mui/material';
import { useNavigate } from 'react-router-dom';

const ChildAnswer: React.FC = () => {
    const [answer, setTopic] = useState('');
    const navigate = useNavigate();

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        console.log(":", answer);
        // 後でここで次の画面に遷移させる
        // navigate('/nextpage'); ← 後から追加
    };

    return (
        <Box display="flex" flexDirection="column" alignItems="center" mt={8}>
            <Typography variant="h4" component="h1" gutterBottom>
                お題は
                ○○です
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
                    onChange={e => setTopic(e.target.value)}
                />
                <Button 
                    type="submit" 
                    variant="contained" 
                    disabled={!answer.trim()} 
                    color="primary"
                >
                    送信
                </Button>
            </Box>
        </Box>
    );
};

export default ChildAnswer;
