import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import './ParentTopicPage.css';
import DanmakuInput from './DanmakuInput';

// sessionStorage から引き継ぎ
const getTabId = () => sessionStorage.getItem('tab_id') ?? '';

type GetRoundResp = { ok: boolean; round?: number; error?: string };
type SubmitTopicResp = { ok: boolean; row?: any; error?: string };

const ParentTopicPage: React.FC = () => {
    const [topic, setTopic] = useState('');
    const [sending, setSending] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    // 左上：ラウンド表示
    const [round, setRound] = useState<number | null>(null);
    const [roundLoading, setRoundLoading] = useState<boolean>(false);

    const navigate = useNavigate();

    // ページ起動時：main-api の get-round を呼んで round を取得して表示
    useEffect(() => {
        const fetchRound = async () => {
            const tab_id = getTabId();
            if (!tab_id) {
                setErr('tab_id が見つかりません（前画面での保存を確認してください）');
                return;
            }
            setRoundLoading(true);
            setErr(null);
            try {
                const { data, error } = await supabase.functions.invoke<GetRoundResp>('main-api', {
                    body: { action: 'get-round', tab_id },
                });
                if (error) {
                    setErr(error.message ?? 'ラウンド情報の取得に失敗しました');
                    return;
                }
                if (!data?.ok || typeof data.round !== 'number') {
                    setErr((data as any)?.error ?? 'ラウンド情報の取得に失敗しました');
                    return;
                }
                setRound(data.round);
            } catch (e: any) {
                setErr(e?.message ?? 'ラウンド情報の取得に失敗しました（unknown error）');
            } finally {
                setRoundLoading(false);
            }
        };
        fetchRound();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const txt = topic.trim();
        if (!txt || sending) return;

        const tab_id = getTabId();
        if (!tab_id) {
            setErr('tab_id が見つかりません（前画面での保存を確認してください）');
            return;
        }

        setSending(true);
        setErr(null);

        try {
            // ← 変更点：main-api の submit-topic を呼ぶ（txt と tab_id のみ必要）
            const { data, error } = await supabase.functions.invoke<SubmitTopicResp>('main-api', {
                body: {
                    action: 'submit-topic',
                    txt,
                    tab_id,
                },
            });

            if (error) {
                setErr(error.message ?? '送信に失敗しました');
                setSending(false);
                return;
            }
            if (!data?.ok) {
                setErr(data?.error ?? '送信に失敗しました');
                setSending(false);
                return;
            }

            // 成功したら次の画面へ
            navigate('/parentwaiting', { state: { topic: txt } });
        } catch (e: any) {
            setErr(e?.message ?? '予期せぬエラーが発生しました');
            setSending(false);
        }
    };

    return (
        <div className="parenttopick-bg">
            {/* 雲 */}
            <img src="/pixel_cloud_transparent.png" alt="" className="parenttopick-cloud left" />
            <img src="/pixel_cloud_transparent.png" alt="" className="parenttopick-cloud right2" />
            <img src="/pixel_cloud_small.png" alt="" className="parenttopick-cloud left2" />
            <img src="/pixel_cloud_small.png" alt="" className="parenttopick-cloud right3" />
            <img src="/pixel_cloud_transparent.png" alt="" className="parenttopick-cloud left3" />
            {/* キャラクター */}
            <img src="/pixel_character.png" alt="" className="parenttopick-character" />
            {/* ひまわり */}
            <img src="/pixel_sunflower.png" alt="" className="parenttopick-sunflower" />
            {/* 火 */}
            <div className="parenttopick-fire-row">
                <img src="/pixel_fire.png" alt="" className="parenttopick-fire" />
                <img src="/pixel_fire.png" alt="" className="parenttopick-fire" />
                <img src="/pixel_fire.png" alt="" className="parenttopick-fire" />
            </div>
            {/* 木盆栽 */}
            <img src="/pixel_tree_bonsai.png" alt="" className="parenttopick-tree-bonsai" />


            {/* タイトル（中央大きく）＋ round数 */}
            <div className="parenttopick-title">
                あなたは親です<br />お題を入力してください<br />
                <span className="parenttopick-round">
                    ROUND {roundLoading ? '…' : (round ?? '—')}
                </span>
            </div>

            {/* 入力フォーム */}
            <form className="parenttopick-form" onSubmit={handleSubmit} style={{ marginTop: '2vw' }}>
                <input
                    className="parenttopick-input"
                    type="text"
                    placeholder="お題入力欄"
                    value={topic}
                    onChange={e => setTopic(e.target.value)}
                />
                <button
                    className="parenttopick-btn"
                    type="submit"
                    disabled={!topic.trim() || sending}
                >
                    {sending ? '送信中…' : '送信'}
                </button>
            </form>
            {err && <div style={{ color: '#ff3333', marginTop: '1vw', textAlign: 'center', fontWeight: 'bold' }}>{err}</div>}
        <DanmakuInput fixedBottom />
        </div>
        
    );
};

export default ParentTopicPage;

