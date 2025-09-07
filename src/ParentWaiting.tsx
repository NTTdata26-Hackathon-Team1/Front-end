import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import './ParentWaiting.css';
import DanmakuInput from './DanmakuInput';
import Title from "./component/title";
import Round from "./component/round";

const POLL_MS = 2000; // 2秒おきに確認

// ★ 追加: tab_id の取得ヘルパー（localStorage → sessionStorage → URL ?tab_id=）
function resolveTabId(): string | null {
    try {
        const ls = window.localStorage.getItem('tab_id') ?? window.localStorage.getItem('tabId');
        if (ls && ls.trim()) return ls.trim();

        const ss = window.sessionStorage.getItem('tab_id') ?? window.sessionStorage.getItem('tabId');
        if (ss && ss.trim()) return ss.trim();

        const q = new URLSearchParams(window.location.search);
        const fromQuery = (q.get('tab_id') ?? q.get('tabId'))?.trim() || '';
        if (fromQuery) return fromQuery;

        return null;
    } catch {
        return null;
    }
}

type GetRoundResp = { ok: boolean; round?: number; error?: string };

const ParentWaiting: React.FC = () => {
    const navigate = useNavigate();
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // ★ 追加: ラウンド表示用
    const [round, setRound] = useState<number | null>(null);
    const [roundLoading, setRoundLoading] = useState<boolean>(false);

    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const inFlightRef = useRef(false);
    const cancelledRef = useRef(false);
    const routedRef = useRef(false); // 遷移したらポーリング停止
    const tabIdRef = useRef<string | null>(null); // ★ 追加: tab_id を保持

    const scheduleNext = () => {
        if (cancelledRef.current || routedRef.current) return;
        timerRef.current = setTimeout(pollOnce, POLL_MS);
    };

    const pollOnce = async () => {
        if (cancelledRef.current || inFlightRef.current || routedRef.current) {
            scheduleNext();
            return;
        }
        inFlightRef.current = true;
        setErrorMsg(null);

        try {
            const tab_id = tabIdRef.current;
            if (!tab_id) {
                setErrorMsg('tab_id が見つかりませんでした（local/sessionStorage または URL の ?tab_id= を確認してください）');
                return;
            }

            // ★ 変更: are-children-answers-complete を polling-api に投げる（tab_id を渡す）
            const { data, error } = await supabase.functions.invoke<{
                ok: boolean;
                ready?: boolean;
                a?: number;
                b?: number;
            }>('polling-api', {
                body: { method: 'are-children-answers-complete', tab_id },
            });

            if (error) {
                setErrorMsg(error.message ?? '確認中にエラーが発生しました');
            } else if (data?.ok && data.ready) {
                // すべての子回答が揃った → 次のページへ
                routedRef.current = true;
                if (timerRef.current) clearTimeout(timerRef.current);
                navigate('/parentselectanswer');
                return;
            }
        } catch (e: any) {
            setErrorMsg(e?.message ?? '確認中にエラーが発生しました（unknown error）');
        } finally {
            inFlightRef.current = false;
            scheduleNext();
        }
    };

    // ★ 追加: 画面起動時に round を取得して左上に表示
    const fetchRound = async () => {
        const tab_id = tabIdRef.current;
        if (!tab_id) {
            setErrorMsg('tab_id が見つかりませんでした（local/sessionStorage または URL の ?tab_id= を確認してください）');
            return;
        }
        setRoundLoading(true);
        try {
            const { data, error } = await supabase.functions.invoke<GetRoundResp>('main-api', {
                body: { method: 'get-round', params: { tab_id } },
            });
            if (error) {
                let msg = error.message;
                if (msg && msg.includes('Failed to send a request to the Edge Function')) {
                    msg = '';
                }
                setErrorMsg(msg ?? 'get-round の呼び出しに失敗しました');
            } else if (!data?.ok || typeof data.round !== 'number') {
                setErrorMsg(data?.error ?? 'round の取得に失敗しました');
            } else {
                setRound(data.round);
            }
        } catch (e: any) {
            setErrorMsg(e?.message ?? 'round の取得に失敗しました（unknown error）');
        } finally {
            setRoundLoading(false);
        }
    };

    useEffect(() => {
        cancelledRef.current = false;
        tabIdRef.current = resolveTabId(); // 初回に tab_id を確定

    // 左上ラウンド表示の初期化（pollOnceで取得）

        // 初回即ポーリング開始
        pollOnce();

        return () => {
            cancelledRef.current = true;
            if (timerRef.current) clearTimeout(timerRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="parentwaiting-bg">
            {/* ラウンド表示（Roundコンポーネントを使用） */}
            <div
                style={{
                    marginTop: "2rem",
                    marginBottom: "2rem",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                }}
            >
                <Round round={round} loading={roundLoading} />
            </div>

            <div className="parentwaiting-titlebox">
                <div
                    style={{
                        fontSize: "4rem",
                        letterSpacing: "0.1em",
                        fontWeight: 700,
                        color: "#fcfbfbff",
                        textShadow: "0 0 1vw #ff69b4, 0.3vw 0.3vw 0 #ff69b4, -0.3vw -0.3vw 0 #ff69b4",
                        textAlign: "center",
                        margin: "5rem 0 2rem 0",
                        display: "inline-block",
                    }}
                >
                    {"子が回答を入力中です".split("").map((char, i) => (
                        <span
                            key={i}
                            style={{
                                display: "inline-block",
                                animation: `bounceChar 0.8s ${i * 0.08}s infinite`,
                            }}
                        >
                            {char}
                        </span>
                    ))}
                    <style>
                        {`
                          @keyframes bounceChar {
                            0% { transform: translateY(0);}
                            30% { transform: translateY(-18px);}
                            60% { transform: translateY(0);}
                            100% { transform: translateY(0);}
                          }
                        `}
                    </style>
                </div>
            </div>
            <img src="/pixel_cloud_small.png" alt="" className="parentwaiting-cloud left" />
            <img src="/pixel_cloud_transparent.png" alt="" className="parentwaiting-cloud right" />
            <img src="/pixel_character.png" alt="" className="parentwaiting-character" />
            <img src="/pixel_girl.png" alt="" className="parentwaiting-girl" />
            <img src="/pixel_bigtree.png" alt="" className="parentwaiting-bigtree" />
            <img src="/pixel_sunflower.png" alt="" className="parentwaiting-sunflower1" />
            <img src="/pixel_sunflower.png" alt="" className="parentwaiting-sunflower2" />
            <img src="/pixel_sunset.png" alt="" className="parentwaiting-sunset" />
            {errorMsg && <div className="parentwaiting-error">{errorMsg}</div>}
            <DanmakuInput fixedBottom />
        </div>
    );
};

export default ParentWaiting;

