import React from 'react';
import { Typography, Box, CircularProgress } from '@mui/material';

const ParentWaiting: React.FC = () => {
    return (
        <Box 
            display="flex" 
            flexDirection="column" 
            alignItems="center" 
            justifyContent="center"
            mt={8}
        >
            <Typography variant="h4" gutterBottom>
                回答入力中です
            </Typography>
 
            {/* 読み込みアニメーション */}
            <CircularProgress  size={80} />
        </Box>
    );
};

export default ParentWaiting;