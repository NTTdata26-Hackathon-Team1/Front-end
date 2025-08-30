import React, { useEffect, useMemo, useState } from 'react';
import { Typography, TextField, Button, Box } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';

// ---- ID ユーティリティ ----
// タブ単位（同タブ内の画面遷移やリロードで維持。タブを閉じると消える）
export const getTabId = () => {
    let id = sessionStorage.getItem('tab_id');
    if (!id) {
        id = crypto.randomUUID();
        sessionStorage.setItem('tab_id', id);
    }
    return id;
};

// デバイス/ブラウザ単位（同一ブラウザプロファイルで永続。タブを跨いでも同じ）
export const getDeviceId = () => {
    let id = localStorage.getItem('device_id');
    if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem('device_id', id);
    }
    return id;
};

const TopMenu: React.FC = () => {
    const [name, setName] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [errorText, setErrorText] = useState<string | null>(null);

    const navigate = useNavigate();

    // マウント時にIDを確定（以降のページでも同じIDを参照できる）
    const tabId = useMemo(getTabId, []);
    const deviceId = useMemo(getDeviceId, []);

    useEffect(() => {
        console.log('tab_id:', tabId);
        console.log('device_id:', deviceId);
    }, [tabId, deviceId]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const value = name.trim();
        if (!value || submitting) return;

        setSubmitting(true);
        setErrorText(null);

        // 認証中ユーザー（未ログインなら null）
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData?.user?.id ?? null;

        // 必要最小限のカラムだけ INSERT
        const { error } = await supabase.from('User_list_test').insert([
            {
                user_id: userId,     // uuid（nullable許容）
                user_name: value,    // 表示名
                device_id: deviceId, // ブラウザプロファイル識別子
                tab_id: tabId,       // タブ識別子
            },
        ]);

        if (error) {
            console.error('code:', error.code, 'msg:', error.message, 'details:', error.details, 'hint:', error.hint);
            setErrorText('名前の保存に失敗しました');
            setSubmitting(false);
            return;
        }

        navigate('/standby');
    };

    // デモ：このタブ宛に Edge Function（dynamic-api）からメッセージを送る
    const pingThisTabFromEdge = async () => {
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData?.user?.id;
        if (!userId) {
            alert('ユーザー未認証のため送信できません（デモ）');
            return;
        }

        // invoke なら URL 構築不要。SDK が正しい Functions URL を使います。
        const session = (await supabase.auth.getSession()).data.session;
        const accessToken = session?.access_token;

        const { data, error } = await supabase.functions.invoke('dynamic-api', {
            body: {
                // Edge Function 側でルーティングするなら "action" を渡すのもアリ
                action: 'push_to_tab',
                target_user_id: userId, // ユーザー単位
                tab_id: tabId,          // タブ単位
                type: 'notify',
                payload: { title: 'Hello Tab', body: 'これはこのタブ宛の通知です' },
            },
            // 通常は自動付与されますが、明示したい場合はヘッダも渡せます
            headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
        });

        if (error) {
            console.error('Edge Function error:', error);
            alert('Edge Function 送信に失敗しました');
            return;
        }

        console.log('Edge Function response:', data);
        alert('Edge Function 送信リクエストを発行しました');
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
                <Button type="submit" variant="contained" disabled={!name.trim() || submitting} color="primary">
                    送信
                </Button>
            </Box>

            {errorText && <Typography color="error" mt={2}>{errorText}</Typography>}

            {/* デモ用：このタブ宛に通知を飛ばす（Edge Function 経由） */}
            <Button variant="outlined" onClick={pingThisTabFromEdge} sx={{ mt: 3 }}>
                このタブに Edge Function から通知を送る（デモ）
            </Button>

            {/* 参考：IDの見える化（デバッグ用） */}
            <Box mt={3} sx={{ opacity: 0.7 }}>
                <Typography variant="body2">tab_id: {tabId}</Typography>
                <Typography variant="body2">device_id: {deviceId}</Typography>
            </Box>
        </Box>
    );
};

export default TopMenu;

