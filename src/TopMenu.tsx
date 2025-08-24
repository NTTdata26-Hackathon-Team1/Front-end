
import React, { useState } from 'react';
import { Typography, TextField, Button, Box } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';


const TopMenu: React.FC = () => {
    const [name, setName] = useState('');
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = name.trim();
    if (!value) return;

    // SupabaseにINSERT
    const { data, error } = await supabase.from('User_list').insert([{ user_name: value }]);
if (error) {
  console.error('code:', error.code, 'msg:', error.message, 'details:', error.details, 'hint:', error.hint);
  alert('名前の保存に失敗しました');
  return;
}

    // 保存成功したら画面遷移
    navigate('/standby');
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
                <Button type="submit" variant="contained" disabled={!name.trim()} color="primary">
                    送信
                </Button>
            </Box>
        </Box>
    );
};

export default TopMenu;