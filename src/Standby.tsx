import React from 'react';
import { Box, Typography, Button } from '@mui/material';

const Standby: React.FC = () => {
	return (
		<Box display="flex" flexDirection="column" alignItems="center" mt={8}>
			<Typography variant="h2" component="h1" gutterBottom>
				朝までそれ正解
			</Typography>
			<Box
				mt={4}
				mb={4}
				width={400}
				height={300}
				display="flex"
				flexDirection="column"
				alignItems="center"
				justifyContent="center"
				bgcolor="#ccc"
				border="1px solid #888"
			>
				<Typography variant="h5" component="div" fontStyle="italic" mb={2}>
					名前のリスト
				</Typography>
				<Box component="ul" sx={{ listStyle: 'disc', pl: 4, fontSize: '1.5rem', fontStyle: 'italic' }}>
					<li>Aさん</li>
					<li>Bさん</li>
					<li>・</li>
					<li>・</li>
					<li>・</li>
				</Box>
			</Box>
			<Button variant="outlined" sx={{ width: 120, fontSize: '1.2rem' }}>
				準備完了
			</Button>
		</Box>
	);
};

export default Standby;
