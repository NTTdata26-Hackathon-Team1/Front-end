import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Typography, TextField, Button, Box } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';

// ---- ID ユーティリティ ----
export const getTabId = () => {
    let id = sessionStorage.getItem('tab_id');
    if (!id) {
        id = crypto.randomUUID();
        sessionStorage.setItem('tab_id', id);
    }
    return id;
};
export const getDeviceId = () => {
    let id = localStorage.getItem('device_id');
    if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem('device_id', id);
    }
    return id;
};

// ---- user_name の保存/取得ユーティリティ（追加） ----
export const getUserName = () => sessionStorage.getItem('user_name') ?? '';
export const setUserName = (name: string) => sessionStorage.setItem('user_name', name);

type RoomItem = { name: string; num_of_s: number | null };

const TopMenu: React.FC = () => {
    // 入力（name は sessionStorage から復元するよう変更）
    const [name, setName] = useState<string>(() => getUserName());
    const [roomName, setRoomName] = useState('');
    const [rounds, setRounds] = useState('');
    const [players, setPlayers] = useState('');

    // 作成＆エラー
    const [submitting, setSubmitting] = useState(false);
    const [errorText, setErrorText] = useState<string | null>(null);

    // 部屋一覧
    const [rooms, setRooms] = useState<RoomItem[]>([]);
    const [roomsErr, setRoomsErr] = useState<string | null>(null);
    const [joining, setJoining] = useState<string | null>(null); // join中のroom名

    const navigate = useNavigate();
    const tabId = useMemo(getTabId, []);
    const deviceId = useMemo(getDeviceId, []);
    const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const POLL_MS = 5000;

    useEffect(() => {
        console.log('tab_id:', tabId);
        console.log('device_id:', deviceId);
    }, [tabId, deviceId]);

    const isPositiveIntStr = (s: string) => {
        if (!s.trim()) return false;
        const n = Number(s);
        return Number.isInteger(n) && n > 0;
    };

    const allValidCreate =
        name.trim().length > 0 &&
        roomName.trim().length > 0 &&
        isPositiveIntStr(rounds) &&
        isPositiveIntStr(players);

    // ===== 部屋一覧ポーリング =====
    const fetchRoomsOnce = async () => {
        try {
            setRoomsErr(null);
            const { data, error } = await supabase.functions.invoke<{ ok: boolean; rooms: RoomItem[] }>('swift-function', {
                body: { action: 'list-rooms' }, // 引数なし
            });
            if (error) {
                setRoomsErr(error.message ?? '部屋一覧の取得に失敗しました');
                return;
            }
            if (!data?.ok) {
                setRoomsErr((data as any)?.error ?? '部屋一覧の取得に失敗しました');
                return;
            }
            setRooms(Array.isArray(data.rooms) ? data.rooms : []);
        } catch (e: any) {
            setRoomsErr(e?.message ?? '部屋一覧の取得に失敗しました（unknown error）');
        }
    };

    const schedulePoll = () => {
        if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
        pollTimerRef.current = setTimeout(async () => {
            await fetchRoomsOnce();
            schedulePoll();
        }, POLL_MS);
    };

    useEffect(() => {
        fetchRoomsOnce(); // 初回即時
        schedulePoll();   // 以降ポーリング
        return () => {
            if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ===== 「部屋を作成」 =====
    const handleCreateRoom = async () => {
        if (!allValidCreate || submitting) return;

        setSubmitting(true);
        setErrorText(null);

        const displayName = name.trim();
        const roomNameTrimmed = roomName.trim();
        const roundsInt = parseInt(rounds, 10);
        const playersInt = parseInt(players, 10);

        try {
            const { data: userData } = await supabase.auth.getUser();
            const userId = userData?.user?.id ?? null;

            // 1) 部屋作成（swift-function）
            const { data: roomData, error: roomErr } = await supabase.functions.invoke('swift-function', {
                body: {
                    action: 'create-room',
                    nickname: displayName,
                    room_name: roomNameTrimmed,
                    round_count: roundsInt,
                    player_count: playersInt,
                    user_id: userId,
                    tab_id: tabId,
                    device_id: deviceId,
                },
            });

            if (roomErr || (roomData && (roomData as any).ok === false)) {
                const msg =
                    (roomData && ((roomData as any).error || (roomData as any).details || (roomData as any).message)) ||
                    roomErr?.message ||
                    '部屋の作成に失敗しました';
                setErrorText(String(msg));
                setSubmitting(false);
                return;
            }

            // 2) dynamic-api にユーザー情報＋room_name を送信
            const dynParams: Record<string, unknown> = {
                user_name: displayName,
                tab_id: tabId,
                device_id: deviceId,
                room_name: roomNameTrimmed,
            };
            if (userId) dynParams.user_id = userId;

            const { data: dynData, error: dynErr } = await supabase.functions.invoke('dynamic-api', {
                body: { action: 'save-user', params: dynParams },
            });
            if (dynErr || (dynData && (dynData as any).ok === false)) {
                console.warn('dynamic-api save-user warn:', dynErr || dynData);
            }

            // ★ user_name を sessionStorage に保存（trim 済み）
            setUserName(displayName);

            // 3) 常に standby へ遷移
            navigate('/standby');
        } catch (err: any) {
            console.error('invoke exception:', err);
            setErrorText(err?.message ?? '予期せぬエラーが発生しました');
            setSubmitting(false);
        }
    };

    // ===== 「部屋に参加」 =====
    const handleJoinRoom = async (targetRoomName: string) => {
        const displayName = name.trim();
        if (!displayName) {
            setErrorText('ニックネームを入力してください');
            return;
        }
        if (joining) return; // 多重クリック防止

        setJoining(targetRoomName);
        setErrorText(null);

        try {
            const { data: userData } = await supabase.auth.getUser();
            const userId = userData?.user?.id ?? null;

            // 1) swift-function: num_of_s を +1
            const { data: joinData, error: joinErr } = await supabase.functions.invoke('swift-function', {
                body: { action: 'join-room', room_name: targetRoomName },
            });
            if (joinErr || (joinData && (joinData as any).ok === false)) {
                const msg =
                    (joinData && ((joinData as any).error || (joinData as any).details || (joinData as any).message)) ||
                    joinErr?.message ||
                    '部屋参加処理に失敗しました';
                setErrorText(String(msg));
                setJoining(null);
                return;
            }

            // 2) dynamic-api: User_list_test に保存
            const dynParams: Record<string, unknown> = {
                user_name: displayName,
                tab_id: tabId,
                device_id: deviceId,
                room_name: targetRoomName,
            };
            if (userId) dynParams.user_id = userId;

            const { data: dynData, error: dynErr } = await supabase.functions.invoke('dynamic-api', {
                body: { action: 'join-room', params: dynParams },
            });
            if (dynErr || (dynData && (dynData as any).ok === false)) {
                console.warn('dynamic-api join-room warn:', dynErr || dynData);
            }

            // ★ user_name を sessionStorage に保存（trim 済み）
            setUserName(displayName);

            // 3) standby へ
            navigate('/standby');
        } catch (e: any) {
            setErrorText(e?.message ?? '部屋参加処理に失敗しました（unknown error）');
            setJoining(null);
        }
    };

    // （任意）デモ：このタブ宛に通知
    const pingThisTabFromEdge = async () => {
        const session = (await supabase.auth.getSession()).data.session;
        const accessToken = session?.access_token;
        const userId = (await supabase.auth.getUser()).data.user?.id;

        if (!userId) {
            alert('ユーザー未認証のため送信できません（デモ）');
            return;
        }

        const { data, error } = await supabase.functions.invoke('dynamic-api', {
            body: {
                action: 'push-to-tab',
                params: {
                    target_user_id: userId,
                    tab_id: tabId,
                    type: 'notify',
                    payload: { title: 'Hello Tab', body: 'これはこのタブ宛の通知です' },
                },
            },
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
        <Box display="flex" flexDirection="column" alignItems="center" mt={4}>
            <Typography variant="h2" component="h1" gutterBottom>
                朝までそれ正解
            </Typography>

            {/* 最上部：ニックネーム */}
            <Box width="100%" maxWidth={520} mt={1}>
                <TextField
                    label="ニックネーム"
                    variant="outlined"
                    value={name}
                    onChange={(e) => {
                        setName(e.target.value);
                        // 入力のたびに保存（復元用）
                        setUserName(e.target.value);
                    }}
                    fullWidth
                />
            </Box>

            {/* 部屋作成 */}
            <Box width="100%" maxWidth={520} mt={4}>
                <Typography variant="h5" component="h2">
                    部屋を作る
                </Typography>

                <Box mt={2} display="flex" flexDirection="column" gap={2}>
                    <TextField
                        label="room name"
                        variant="outlined"
                        value={roomName}
                        onChange={(e) => setRoomName(e.target.value)}
                        inputProps={{ maxLength: 50 }}
                        fullWidth
                    />

                    <TextField
                        label="round数"
                        variant="outlined"
                        type="number"
                        value={rounds}
                        onChange={(e) => setRounds(e.target.value)}
                        inputProps={{ inputMode: 'numeric', step: 1, min: 1 }}
                        helperText="正の整数を入力"
                        fullWidth
                    />

                    {/* 人数 + 右側に「部屋を作成」ボタン */}
                    <Box display="flex" gap={2} alignItems="center">
                        <TextField
                            label="人数"
                            variant="outlined"
                            type="number"
                            value={players}
                            onChange={(e) => setPlayers(e.target.value)}
                            inputProps={{ inputMode: 'numeric', step: 1, min: 1 }}
                            helperText="正の整数を入力"
                            sx={{ flex: 1 }}
                        />
                        <Button
                            variant="contained"
                            color="primary"
                            onClick={handleCreateRoom}
                            disabled={!allValidCreate || submitting}
                            sx={{ whiteSpace: 'nowrap', height: 56 }}
                        >
                            部屋を作成
                        </Button>
                    </Box>
                </Box>
            </Box>

            {errorText && (
                <Typography color="error" mt={2}>
                    {errorText}
                </Typography>
            )}

            {/* 任意：デモボタン */}
            <Button variant="outlined" onClick={pingThisTabFromEdge} sx={{ mt: 3 }}>
                このタブに Edge Function から通知を送る（デモ）
            </Button>

            {/* デバッグ表示 */}
            <Box mt={3} sx={{ opacity: 0.7 }}>
                <Typography variant="body2">tab_id: {tabId}</Typography>
                <Typography variant="body2">device_id: {deviceId}</Typography>
                <Typography variant="body2">user_name(sessionStorage): {getUserName()}</Typography>
            </Box>

            {/* ===== 部屋に参加する（ボタン一覧） ===== */}
            <Box width="100%" maxWidth={520} mt={6}>
                <Typography variant="h5" component="h2">
                    部屋に参加する
                </Typography>

                {roomsErr && (
                    <Typography color="error" sx={{ mt: 1 }}>
                        {roomsErr}
                    </Typography>
                )}

                <Box mt={2} display="flex" flexDirection="column" gap={1.5}>
                    {rooms.length === 0 ? (
                        <Typography sx={{ opacity: 0.7 }}>（30分以内に作成された部屋がありません）</Typography>
                    ) : (
                        rooms.map((r) => (
                            <Button
                                key={`${r.name}`}
                                variant="outlined"
                                onClick={() => handleJoinRoom(r.name)}
                                disabled={!name.trim() || joining === r.name}
                                sx={{ display: 'flex', justifyContent: 'space-between', textTransform: 'none' }}
                            >
                                <span>room name: <b>{r.name}</b></span>
                                <span>人数: <b>{r.num_of_s ?? 0}</b></span>
                            </Button>
                        ))
                    )}
                </Box>
            </Box>
        </Box>
    );
};

export default TopMenu;
