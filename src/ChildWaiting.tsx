import React from 'react';
import { Typography, Box, CircularProgress } from '@mui/material';

const ChildWaiting: React.FC = () => {
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
            {/* 読み込みアニメーション */}
            <CircularProgress  size={80} />
        </Box>
    );
};

export default ChildWaiting;
