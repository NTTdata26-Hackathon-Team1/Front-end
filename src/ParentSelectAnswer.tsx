import React, { useEffect, useState, useRef } from 'react';
import { supabase } from './supabaseClient';
import { useNavigate } from 'react-router-dom';
import './ParentSelectAnswer.css';
import Card from './component/card';
import Title from './component/title';
import Round from './component/round';
import Button from './component/button';

type AnswerPair = { user_name: string; input_QA: string };
type GetRoundResp = { ok: boolean; round?: number; error?: string };

// tab_id 解決ヘルパー（localStorage → sessionStorage → URL ?tab_id=）
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

function ParentSelectAnswer() {
  const [answers, setAnswers] = useState<AnswerPair[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [deciding, setDeciding] = useState(false);

  // round 表示用
  const [round, setRound] = useState<number | null>(null);
  const [roundLoading, setRoundLoading] = useState<boolean>(false);

  const [topic, setTopic] = useState<string | null>(null);
  const [loadingTopic, setLoadingTopic] = useState<boolean>(false);

  const navigate = useNavigate();
  const navTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tabIdRef = useRef<string | null>(null);

  // 起動時に round を取得（main-api / get-round）
  const fetchRound = async () => {
    const tab_id = tabIdRef.current;
    if (!tab_id) {
      setErrMsg('tab_id が見つかりませんでした（local/sessionStorage または URL の ?tab_id= を確認してください）');
      return;
    }
    setRoundLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke<GetRoundResp>('main-api', {
        body: { method: 'get-round', params: { tab_id } },
      });
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

  // 起動時：候補の取得（main-api / list-parent-select-answers） & round 取得
  useEffect(() => {
    let cancelled = false;
    tabIdRef.current = resolveTabId();

    // 左上 round 表示の初期化
    fetchRound();
    fetchTopic();

    (async () => {
      setLoading(true);
      setErrMsg(null);
      try {
        const tab_id = tabIdRef.current;
        if (!tab_id) {
          setErrMsg('tab_id が見つかりませんでした（local/sessionStorage または URL の ?tab_id= を確認してください）');
          setAnswers([]);
          return;
        }

        const { data, error } = await supabase.functions.invoke<{ ok: boolean; answers?: AnswerPair[] }>(
          'main-api',
          { body: { method: 'list-parent-select-answers', params: { tab_id } } }
        );

        if (cancelled) return;

        if (error) {
          setErrMsg(error.message ?? '回答一覧の取得に失敗しました');
        } else if (data?.ok && Array.isArray(data.answers)) {
          setAnswers(data.answers);
        } else {
          setAnswers([]);
        }
      } catch (e: any) {
        if (!cancelled) setErrMsg(e?.message ?? '回答一覧の取得に失敗しました（unknown error）');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current);
    };
  }, []);

  // 決定（main-api / mark-selected-answer）
  const handleDecide = async () => {
    if (selectedIndex === null || deciding) return;
    const target = answers[selectedIndex];
    if (!target) return;

    setDeciding(true);
    setErrMsg(null);
    let scheduled = false;

    try {
      const currentRound = typeof round === 'number' ? round : 1;

      const { error } = await supabase.functions.invoke<{ ok: boolean }>(
        'main-api',
        {
          body: {
            method: 'mark-selected-answer',
            params: {
              user_name: target.user_name,
              input_QA: target.input_QA,
              round: currentRound,
            },
          },
        }
      );

      if (error) {
        setErrMsg(error.message ?? '決定に失敗しました');
      } else {
        // 2秒待ってから結果画面へ
        scheduled = true;
        navTimeoutRef.current = setTimeout(() => {
          navigate('/selectedanswer', { replace: true });
        }, 2000);
      }
    } catch (e: any) {
      setErrMsg(e?.message ?? '決定に失敗しました（unknown error）');
    } finally {
      if (!scheduled) setDeciding(false);
    }
  };

  return (
    <div className="parentselectanswer-bg">
      {/* 左上：ラウンド表示（ChildAnswerListと同じ配置・サイズ） */}
      <div style={{ position: 'absolute', top: '1vw', left: '10vw', transform: 'translateX(-50%)', zIndex: 120 }}>
        <Round round={round} loading={roundLoading} />
      </div>

      {/* タイトル・お題（ChildAnswerListと同じ表示方法） */}
      <div style={{ position: 'absolute', top: '5vw', left: '50%', transform: 'translateX(-50%)', zIndex: 120, textAlign: 'center', width: '100%' }}>
        <div style={{ fontSize: '4vw', fontWeight: 700, color: '#fcfbfbff', textShadow: '0 2px 12px #f52ba7ff, 0 1px 0 #f645bbff', marginBottom: '1vw' }}>
          {loadingTopic ? 'お題を取得中…' : topic ? `「${topic}」` : 'お題未設定'}
        </div>
        <div style={{ fontSize: '3vw', fontWeight: 700, color: '#fcfbfbff', textShadow: '0 2px 8px #f52ba7ff, 0 1px 0 #f645bbff' }}>
          ベストな回答を選択してください
        </div>
      </div>

      {loading && <div className="parentselectanswer-loading">読み込み中…</div>}
      {errMsg && <div className="parentselectanswer-error">{errMsg}</div>}

      {/* イラスト配置例: 雲・旗・きのこ・キャラなど */}
      <img src="/pixel_cloud_small.png" alt="" className="parentselectanswer-cloud1" />
      <img src="/pixel_cloud_small.png" alt="" className="parentselectanswer-cloud2" />
      <img src="/pixel_cloud_small.png" alt="" className="parentselectanswer-cloud3" />
      <img src="/pixel_vine.png" alt="" className="parentselectanswer-vine1" />
      <img src="/pixel_vine.png" alt="" className="parentselectanswer-vine2" />
      <div className="parentselectanswer-sunflower-row">
        <img src="/pixel_sunflower.png" alt="" className="parentselectanswer-sunflower" />
        <img src="/pixel_sunflower.png" alt="" className="parentselectanswer-sunflower" />
        <img src="/pixel_sunflower.png" alt="" className="parentselectanswer-sunflower" />
        <img src="/pixel_sunflower.png" alt="" className="parentselectanswer-sunflower" />
        <img src="/pixel_sunflower.png" alt="" className="parentselectanswer-sunflower" />
        <img src="/pixel_sunflower.png" alt="" className="parentselectanswer-sunflower" />
      </div>
      <img src="/pixel_cactus.png" alt="" className="parentselectanswer-cactus1" />
      <img src="/pixel_cactus.png" alt="" className="parentselectanswer-cactus2" />


      {/* 回答カード一覧（タイトル下・z-index:120・さらに下に配置） */}
      <div className="parentselectanswer-answers">
        {answers.length > 0 ? (
          answers.map((a, idx) => (
            <Card
              key={`${a.user_name}-${idx}`}
              userName={a.user_name}
              inputQA={a.input_QA}
              selected={selectedIndex === idx}
              onClick={() => setSelectedIndex(idx)}
            />
          ))
        ) : (
          !loading && <div className="parentselectanswer-answer parentselectanswer-answer-empty">（回答がまだありません）</div>
        )}
      </div>

      {/* ボタンをカードの下に絶対配置 */}
      <div className="parentselectanswer-button-row">
        <Button
          disabled={selectedIndex === null || deciding}
          onClick={handleDecide}
        >
          {deciding ? '決定中…' : '決定'}
        </Button>
      </div>
    </div>
  );
}

export default ParentSelectAnswer;

