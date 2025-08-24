import React, { useState } from 'react';
import { Typography, TextField, Button, Box } from '@mui/material';

const TopMenu: React.FC = () => {
    const [name, setName] = useState('');
    console.log(name);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // ここで送信処理を追加できます
        alert(`送信された名前: ${name}`);
    };

    return (
        <Box display="flex" flexDirection="column" alignItems="center" mt={8}>
            <Typography variant="h2" component="h1" gutterBottom>
                朝までそれ正解
            </Typography>
            <Box component="form" onSubmit={handleSubmit} display="flex" alignItems="center" gap={2} mt={4}>
                <TextField
                    label="ニックネーム"
                    variant="outlined"
                    value={name}
                    onChange={e => setName(e.target.value)}
                />
                <Button type="submit" variant="contained" color="primary">
                    送信
                </Button>
            </Box>
        </Box>
    );
};

export default TopMenu;