import React, { useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import { useNavigate } from 'react-router-dom';
import './ChildAnswerList.css';
import DanmakuInput from './DanmakuInput';
import Title from './component/title';
import Round from './component/round';
import Card from './component/card';

type AnswerPair = { user_name: string; input_QA: string };
type GetRoundResp = { ok: boolean; round?: number; error?: string };

const POLL_MS = 3000;

// tab_id の取得ヘルパー（localStorage → sessionStorage → URL ?tab_id=）
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

function ChildAnswerList() {
  const [answers, setAnswers] = useState<AnswerPair[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 左上：ラウンド表示
  const [round, setRound] = useState<number | null>(null);
  const [roundLoading, setRoundLoading] = useState(false);

  const [topic, setTopic] = useState<string | null>(null);
  const [loadingTopic, setLoadingTopic] = useState<boolean>(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const cancelledRef = useRef(false);
  const routedRef = useRef(false);
  const tabIdRef = useRef<string | null>(null); // 取得した tab_id を保持
  const navigate = useNavigate();

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

      // 回答一覧 & 決定済み判定（polling-api）
      const [listRes, decideRes] = await Promise.all([
        supabase.functions.invoke<{ ok: boolean; answers?: AnswerPair[] }>('polling-api', {
          body: { method: 'list-child-answers', tab_id },
        }),
        supabase.functions.invoke<{ ok: boolean; decided?: boolean }>('polling-api', {
          body: { method: 'is-selection-decided', tab_id },
        }),
      ]);

      if (listRes.error) {
        setErrorMsg(listRes.error.message ?? '回答一覧の取得に失敗しました');
      } else if (listRes.data?.ok && Array.isArray(listRes.data.answers)) {
        setAnswers(listRes.data.answers);
      }

      // 決定済みなら 2 秒待ってから遷移
      if (!decideRes.error && decideRes.data?.ok && decideRes.data.decided) {
        routedRef.current = true;
        if (timerRef.current) clearTimeout(timerRef.current); // ポーリング停止
        navTimeoutRef.current = setTimeout(() => {
          navigate('/selectedanswer', { replace: true });
        }, 2000);
        return;
      }
    } catch (e: any) {
      setErrorMsg(e?.message ?? '更新中にエラーが発生しました');
    } finally {
      inFlightRef.current = false;
      scheduleNext();
    }
  };

  // 画面起動時：round を取得して左上に表示（main-api）
  const fetchRound = async () => {
    const tab_id = tabIdRef.current;
    if (!tab_id) {
      setErrorMsg('tab_id が見つかりません（前画面やURLを確認してください）');
      return;
    }
    setRoundLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke<GetRoundResp>('main-api', {
        body: { method: 'get-round', params: { tab_id } },
      });
      if (error) {
        setErrorMsg(error.message ?? 'round の取得に失敗しました');
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

  // お題取得
  const fetchTopic = async () => {
    const tab_id = tabIdRef.current;
    if (!tab_id) return;
    setLoadingTopic(true);
    try {
      const { data, error } = await supabase.functions.invoke<{ ok: boolean; topic?: string | null; error?: string }>(
        'main-api',
        { body: { action: 'get-current-topic', tab_id } }
      );
      if (error) {
        setTopic(null);
      } else if (!data?.ok) {
        setTopic(null);
      } else {
        setTopic(typeof data.topic === 'string' && data.topic.length > 0 ? data.topic : null);
      }
    } catch {
      setTopic(null);
    } finally {
      setLoadingTopic(false);
    }
  };

  useEffect(() => {
    cancelledRef.current = false;
    tabIdRef.current = resolveTabId(); // 初回マウント時に tab_id を確定

    // 左上のラウンド表示を先に取得
    fetchRound();
    // お題取得
    fetchTopic();
    // 回答一覧のポーリング開始
    pollOnce();

    return () => {
      cancelledRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 色分けは行わず、すべて同じカードスタイルで表示します。

  return (
    <div className="childanswerlist-bg">
      {/* 左上：ラウンド表示（pixel-artラベル） */}
      <Round round={round} loading={roundLoading} />
      {/* タイトル（お題 & 回答一覧） */}
      <div style={{ position: 'absolute', top: '5vw', left: '50%', transform: 'translateX(-50%)', zIndex: 120, textAlign: 'center' }}>
        <Title
          text={loadingTopic ? 'お題を取得中…' : topic ? `「${topic}」` : 'お題未設定'}
          style={{
            fontSize: '4vw',
            fontWeight: 700,
            color: '#fcfbfbff',
            marginBottom: '1vw',
            textAlign: 'center',
          }}
        />
        <Title
          text="回答一覧"
          style={{
            fontSize: '3vw',
            fontWeight: 700,
            color: '#fcfbfbff',
            marginBottom: 0,
            textAlign: 'center',
          }}
        />
      </div>
      {/* タイトルとカードの間隔をさらに狭く（top: 9vw, marginTop: 1vw） */}
      <div style={{ position: 'absolute', top: '4vw', left: '50%', transform: 'translateX(-50%)', width: '100%', zIndex: 120 }}>
        {errorMsg && (
          <div className="childanswerlist-error">{errorMsg}</div>
        )}
        {/* 回答カード一覧 */}
        <div className="childanswerlist-answers">
          {answers.length > 0 ? (
            answers.map((a, idx) => (
              <Card
                key={`${a.user_name}-${idx}`}
                userName={a.user_name}
                inputQA={a.input_QA}
                selected={false}
                onClick={() => {}}
              />
            ))
          ) : (
            <div className="childanswerlist-answer">（まだ回答はありません）</div>
          )}
        </div>
      </div>
      {/* イラスト配置例: 雲・旗・きのこ・キャラなど */}
      <img src="/pixel_cloud_small.png" alt="" className="childanswerlist-cloud-small" />
      <img src="/pixel_cloud_transparent.png" alt="" className="childanswerlist-cloud-transparent" />
      <img src="/pixel_tower.png" alt="" className="childanswerlist-tower" />
      <img src="/pixel_tree.png" alt="" className="childanswerlist-tree" />
      <img src="/pixel_sunflower.png" alt="" className="childanswerlist-sunflower" />
      {/* DanmakuInputを最下部に追加 */}
      <DanmakuInput fixedBottom />
    </div>
  );
}

export default ChildAnswerList;
