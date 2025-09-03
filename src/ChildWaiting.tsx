import React, { useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import { useNavigate } from 'react-router-dom';
import './ChildWaiting.css';

const POLL_MS_ACTIVE = 2000;
const POLL_MS_HIDDEN = 8000;

type ReadyResp = { ok: boolean; ready: boolean };

const ChildWaiting: React.FC = () => {
    const [errMsg, setErrMsg] = useState<string | null>(null);
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
            const { data, error } = await supabase.functions.invoke<ReadyResp>('clever-handler', {
                body: { method: 'is-topic-ready' } // 引数なし指定
            });

            if (cancelledRef.current || routedRef.current) return;

            if (error) {
                setErrMsg(error.message ?? 'Edge Function error');
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

    useEffect(() => {
        cancelledRef.current = false;
        pollOnce();

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

        return (
            <div className="childwaiting-bg">
                <div className="childwaiting-title">親がお題を入力中です</div>
                {/* イラスト */}
			　　<img src="/pixel_cloud_small.png" alt="" className="childwaiting-cloud left" />
			　　<img src="/pixel_cloud_transparent.png" alt="" className="childwaiting-cloud right" />
                <img src="/pixel_character.png" alt="" className="childwaiting-character" />
                <img src="/pixel_sunflower.png" alt="" className="childwaiting-sunflower" />
                <img src="/pixel_sunset.png" alt="" className="childwaiting-sunset" />
                <img src="/pixel_tower.png" alt="" className="childwaiting-tower" />
                <img src="/pixel_tree_bonsai.png" alt="" className="childwaiting-tree-bonsai" />



                {errMsg && (
                    <div className="childwaiting-error">{errMsg}</div>
                )}
            </div>
        );
};

export default ChildWaiting;

