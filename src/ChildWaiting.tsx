import React, { useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import { useNavigate } from 'react-router-dom';
import './ChildWaiting.css';
import DanmakuInput from './DanmakuInput';

const POLL_MS_ACTIVE = 2000;
const POLL_MS_HIDDEN = 8000;

type ReadyResp = { ok: boolean; ready: boolean };
type GetRoundResp = { ok: boolean; round?: number; error?: string };

const ChildWaiting: React.FC = () => {
    const [errMsg, setErrMsg] = useState<string | null>(null);

    // ラウンド表示用
    const [round, setRound] = useState<number | null>(null);
    const [roundLoading, setRoundLoading] = useState<boolean>(false);

    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const inFlightRef = useRef(false);
    const cancelledRef = useRef(false);
    const routedRef = useRef(false);

    const navigate = useNavigate();

    const scheduleNext = () => {
        if (cancelledRef.current || routedRef.current) return;
        const interval = document.hidden ? POLL_MS_HIDDEN : POLL_MS_ACTIVE;
        timerRef.current = setTimeout(pollOnce, interval);
    };

    const pollOnce = async () => {
        if (cancelledRef.current || inFlightRef.current || routedRef.current) {
            scheduleNext();
            return;
        }
        inFlightRef.current = true;
        setErrMsg(null);

        try {
            const { data, error } = await supabase.functions.invoke<ReadyResp>(
                'polling-api',
                {
                    body: {
                        method: 'is-topic-ready',
                        params: { tab_id: sessionStorage.getItem('tab_id') ?? '' },
                    },
                }
            );

            if (cancelledRef.current || routedRef.current) return;

            if (error) {
                setErrMsg(error.message ?? 'polling-api error');
            } else if (data?.ok && data.ready) {
                routedRef.current = true;
                if (timerRef.current) clearTimeout(timerRef.current);
                navigate('/childanswer');
                return;
            }
        } catch (e: any) {
            if (!cancelledRef.current) setErrMsg(e?.message ?? 'unknown error');
        } finally {
            inFlightRef.current = false;
            if (!cancelledRef.current && !routedRef.current) scheduleNext();
        }
    };

    // 画面起動時：round を取得して左上に表示
    const fetchRound = async () => {
        const tab_id = sessionStorage.getItem('tab_id') ?? '';
        if (!tab_id) {
            setErrMsg('tab_id が見つかりません（前画面での保存を確認してください）');
            return;
        }
        setRoundLoading(true);
        try {
            const { data, error } = await supabase.functions.invoke<GetRoundResp>(
                'main-api',
                {
                    body: { method: 'get-round', params: { tab_id } },
                }
            );
            if (error) {
                setErrMsg(error.message ?? 'get-round の呼び出しに失敗しました');
            } else if (!data?.ok || typeof data.round !== 'number') {
                setErrMsg(data?.error ?? 'round の取得に失敗しました');
            } else {
                setRound(data.round);
            }
        } catch (e: any) {
            setErrMsg(e?.message ?? 'round の取得に失敗しました（unknown error）');
        } finally {
            setRoundLoading(false);
        }
    };

    useEffect(() => {
        cancelledRef.current = false;
        fetchRound(); // ラウンド表示の初期化
        pollOnce();   // 親のお題準備完了のポーリング開始

        const onVis = () => {
            if (!cancelledRef.current && !routedRef.current) {
                if (timerRef.current) clearTimeout(timerRef.current);
                pollOnce();
            }
        };
        document.addEventListener('visibilitychange', onVis);

        return () => {
            cancelledRef.current = true;
            if (timerRef.current) clearTimeout(timerRef.current);
            document.removeEventListener('visibilitychange', onVis);
        };
    }, []);

    return (
        <div className="childwaiting-bg">
            {/* イラスト */}
            <img src="/pixel_cloud_small.png" alt="" className="childwaiting-cloud left" />
            <img src="/pixel_cloud_transparent.png" alt="" className="childwaiting-cloud right" />
            <img src="/pixel_character.png" alt="" className="childwaiting-character" />
            <img src="/pixel_sunflower.png" alt="" className="childwaiting-sunflower" />
            <img src="/pixel_sunset.png" alt="" className="childwaiting-sunset" />
            <img src="/pixel_tower.png" alt="" className="childwaiting-tower" />
            <img src="/pixel_tree_bonsai.png" alt="" className="childwaiting-tree-bonsai" />
            
            {/* タイトル（中央大きく）＋ round数 */}
            <div
  style={{
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    margin: "5rem 0 2rem 0",
    fontSize: "4rem",
    fontWeight: 700,
    letterSpacing: "0.1em",
    color: "#fcfbfbff",
    textShadow: "0 4px 24px #f52ba7ff, 0 1px 0 #f645bbff",
  }}
>
  {"親がお題を入力中です".split("").map((char, i) => (
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
            <div className="childwaiting-round"
            style={{
                textShadow: "0 4px 24px #f52ba7ff, 0 1px 0 #f645bbff",
                fontWeight: 900,
                color: "#fcfbfbff",
            }}
            >ROUND{roundLoading ? '…' : (round ?? '—')} </div>

            {errMsg && (
                <div className="childwaiting-error">{errMsg}</div>
            )}
            <DanmakuInput fixedBottom />
        </div>
    );
};

export default ChildWaiting;
