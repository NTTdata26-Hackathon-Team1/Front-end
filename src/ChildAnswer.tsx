import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import './ChildAnswer.css';
import DanmakuInput from './DanmakuInput';

// sessionStorage から取得（TopMenu で保存済み想定）
const getTabId = () => sessionStorage.getItem('tab_id') ?? '';

const ChildAnswer: React.FC = () => {
    const [topic, setTopic] = useState<string | null>(null); // 取得したお題
    const [answer, setAnswer] = useState('');
    const [sending, setSending] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // お題のロード状態
    const [loadingTopic, setLoadingTopic] = useState(true);

    // ラウンド表示用
    const [round, setRound] = useState<number | null>(null);
    const [roundLoading, setRoundLoading] = useState<boolean>(false);

    const navigate = useNavigate();

    // 起動時にお題＆ラウンドを取得（main-api）
    useEffect(() => {
        let cancelled = false;
        const tab_id = getTabId();

        if (!tab_id) {
            setErrorMsg('tab_id が見つかりません（前画面での保存を確認してください）');
            setLoadingTopic(false);
            setRoundLoading(false);
            return () => { cancelled = true; };
        }

        // ラウンド
        (async () => {
            setRoundLoading(true);
            try {
                const { data, error } = await supabase.functions.invoke<{
                    ok: boolean;
                    round?: number;
                    error?: string;
                }>('main-api', {
                    body: { action: 'get-round', params: { tab_id } },
                });
                if (cancelled) return;

                if (error) {
                    setErrorMsg(error.message ?? 'ラウンド情報の取得に失敗しました');
                } else if (!data?.ok || typeof data.round !== 'number') {
                    setErrorMsg(data?.error ?? 'ラウンド情報の取得に失敗しました');
                } else {
                    setRound(data.round);
                }
            } catch (e: any) {
                if (!cancelled) setErrorMsg(e?.message ?? 'ラウンド情報の取得に失敗しました（unknown error）');
            } finally {
                if (!cancelled) setRoundLoading(false);
            }
        })();

        // お題
        (async () => {
            setLoadingTopic(true);
            try {
                const { data, error } = await supabase.functions.invoke<{
                    ok: boolean;
                    topic?: string | null;
                    error?: string;
                }>('main-api', {
                    body: { action: 'get-current-topic', params: { tab_id } },
                });
                if (cancelled) return;

                if (error) {
                    setErrorMsg(error.message ?? 'お題の取得に失敗しました');
                } else if (!data?.ok) {
                    setErrorMsg(data?.error ?? 'お題の取得に失敗しました');
                } else {
                    setTopic(typeof data.topic === 'string' && data.topic.length > 0 ? data.topic : null);
                }
            } catch (e: any) {
                if (!cancelled) setErrorMsg(e?.message ?? 'お題の取得に失敗しました（unknown error）');
            } finally {
                if (!cancelled) setLoadingTopic(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!answer.trim() || sending) return;

        const tab_id = getTabId();
        if (!tab_id) {
            setErrorMsg('tab_id が見つかりません（前画面での保存を確認してください）');
            return;
        }

        setSending(true);
        setErrorMsg(null);

        try {
            // main-api: submit-answer（tab_id と txt のみ）
            const { data, error } = await supabase.functions.invoke<{
                ok: boolean;
                row?: any;
                updated?: boolean;
                error?: string;
            }>('main-api', {
                body: {
                    action: 'submit-answer',
                    params: {
                        tab_id,
                        txt: answer.trim(),
                    },
                },
            });

            if (error) {
                setErrorMsg(error.message ?? '送信に失敗しました');
            } else if (!data?.ok) {
                setErrorMsg(data?.error ?? '送信に失敗しました');
            } else {
                // ✅ 送信成功時に一覧ページへ
                navigate('/childanswerlist');
            }
        } catch (err: any) {
            setErrorMsg(err?.message ?? '送信エラー');
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="childanswer-bg">
            {/* 雲・キャラ・花・火・盆栽などイラスト */}
            <img src="/pixel_cloud_small.png" alt="" className="childanswer-cloud-small" />
            <img src="/pixel_cloud_transparent.png" alt="" className="childanswer-cloud-transparent" />
            <img src="/pixel_character.png" alt="" className="childanswer-character" />
            <img src="/pixel_girl.png" alt="" className="childanswer-girl" />
            <img src="/pixel_flower.png" alt="" className="childanswer-flower1" />
            <img src="/pixel_flower.png" alt="" className="childanswer-flower2" />
            <img src="/pixel_tree_bonsai.png" alt="" className="childanswer-tree-bonsai" />
            <img src="/pixel_moon.png" alt="" className="childanswer-moon" />
            <img src="/pixel_mushroom.png" alt="" className="childanswer-mushroom" />
            {/* パイプ */}
            <div className="childanswer-pipe-row">
                <img src="/pixel_pipe.png" alt="" className="childanswer-pipe1" />
                <img src="/pixel_pipe.png" alt="" className="childanswer-pipe2" />
                <img src="/pixel_pipe.png" alt="" className="childanswer-pipe3" />

            </div>

            {/* ラウンド数（左上固定） */}
            <div className="childanswer-round">
                ROUND {roundLoading ? '…' : (round ?? '—')}
            </div>

            {/* タイトル（中央大きく）＋お題 */}
            <div className="childanswer-title">
                {loadingTopic
                    ? 'お題を取得中…'
                    : topic
                        ? <>お題は 「{topic}」 です</>
                        : 'お題は未設定'}
            </div>

            {/* 入力フォーム */}
            <form className="childanswer-form" onSubmit={handleSubmit}>
                <input
                    className="childanswer-input"
                    type="text"
                    placeholder="解答を入力してください"
                    value={answer}
                    onChange={e => setAnswer(e.target.value)}
                />
                <button
                    className="childanswer-btn"
                    type="submit"
                    disabled={!answer.trim() || sending}
                >
                    {sending ? '送信中…' : '送信'}
                </button>
            </form>

            {errorMsg && (
                <div className="childanswer-error">{errorMsg}</div>
            )}
            <DanmakuInput fixedBottom />
        </div>
    );
};

export default ChildAnswer;

