import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import './ParentTopicPage.css';

// sessionStorage から引き継ぎ
const getTabId = () => sessionStorage.getItem('tab_id') ?? '';
const getUserName = () => sessionStorage.getItem('user_name') ?? '';

const ParentTopicPage: React.FC = () => {
    const [topic, setTopic] = useState('');
    const [sending, setSending] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const txt = topic.trim();
        if (!txt || sending) return;

        const tab_id = getTabId();
        const user_name = getUserName();

        if (!tab_id || !user_name) {
            setErr('tab_id もしくは user_name が見つかりません（前画面での保存を確認してください）');
            return;
        }

        setSending(true);
        setErr(null);

        try {
            // Edge Function: clever-handler を呼ぶ
            const { error } = await supabase.functions.invoke('clever-handler', {
                body: {
                    method: "submit-topic",
                    // 単純化："txt" と一緒に tab_id / user_name も渡す
                    txt,
                    tab_id,
                    user_name,
                },
            });

            if (error) {
                setErr(error.message ?? '送信に失敗しました');
                setSending(false);
                return;
            }

            // 成功したら次の画面へ（お好みで変更）
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

            {/* サブタイトル（右上） */}
            <div className="parenttopick-subtitle">ASAMADE SORE SEIKAI</div>

            {/* タイトル（中央大きく） */}
            <div className="parenttopick-title">あなたは親です<br />お題を入力してください</div>

            {/* 入力フォーム */}
            <form className="parenttopick-form" onSubmit={handleSubmit}>
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

            {/* 地面 */}
            <div className="parenttopick-ground"></div>
        </div>
    );
};

export default ParentTopicPage;
