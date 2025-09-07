
import React, { useEffect, useState, useRef } from 'react';
import { supabase } from './supabaseClient';
import { useNavigate } from 'react-router-dom';
import DanmakuInput from './DanmakuInput';
import Round from './component/round';
import Title from './component/title';
import Card from './component/card';
import Button from './component/button';

type AnswerPair = { user_name: string; input_QA: string };
type GetRoundResp = { ok: boolean; round?: number; error?: string };
type GetSelectedAnswerResp = {
  ok: boolean;
  best?: AnswerPair | null;
  others?: AnswerPair[];
  error?: string;
};
type DecideAndRouteResp = {
  ok: boolean;
  matched?: boolean;
  to?: string;
  now_host?: boolean;
  finished?: boolean;
  round?: number;
  room_name?: string;
  counts?: { a: number; b: number };
  reason?: string;
  error?: string;
};

const POLL_MS = 2000; // decide-and-route ポーリング間隔(ms)

const containerStyle: React.CSSProperties = {
  textAlign: 'center',
  marginTop: '20px',
  position: 'relative', // 左上バッジ用
};

const titleStyle: React.CSSProperties = {
  fontSize: '3rem',
  marginTop: '-5vw',
  marginBottom: '20px',
  color: '#fff',
  fontWeight: 'bold',
  letterSpacing: '0.1em',
  zIndex: 10
};

const answerCardStyle: React.CSSProperties = {
  width: '300px',
  height: '180px',
  background: '#1ab641ff',
  border: '2px solid #888',
  borderRadius: '40px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '1.5rem',
  margin: '0 auto 30px auto',
  padding: '20px',
  whiteSpace: 'pre-wrap',
  textAlign: 'center',
  lineHeight: 1.5,
};

const nameListCardStyle: React.CSSProperties = {
  width: '350px',
  minHeight: '180px',
  background: '#1ab641ff',
  border: '2px solid #888',
  borderRadius: '20px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  justifyContent: 'center',
  fontSize: '1.2rem',
  margin: '0 auto 30px auto',
  padding: '20px',
};

const buttonStyle: React.CSSProperties = {
  width: '120px',
  height: '60px',
  fontSize: '1.2rem',
  borderRadius: '20px',
  border: '1px solid #888',
  background: '#f5f5f5',
  cursor: 'pointer',
  margin: '0 auto',
  display: 'block',
};

const roundBadgeStyle: React.CSSProperties = {
  position: 'fixed',
  top: '1vw',
  left: '1vw',
  fontSize: '2vw',
  color: '#fffbe6',
  fontWeight: 'bold',
  textShadow: '0.3vw 0.3vw 0 #ff69b4',
  zIndex: 100,
  letterSpacing: '0.2em',
};

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

function SelectedAnswer() {
  const [best, setBest] = useState<AnswerPair | null>(null);
  const [others, setOthers] = useState<AnswerPair[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // round 表示用
  const [round, setRound] = useState<number | null>(null);
  const [roundLoading, setRoundLoading] = useState<boolean>(false);

  // 「次へ」送信中フラグ / 送信後の待機状態（ポーリング中）フラグ
  const [nexting, setNexting] = useState<boolean>(false);
  const [waitingRoute, setWaitingRoute] = useState<boolean>(false);

  const navigate = useNavigate();

  // ポーリング制御
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const cancelledRef = useRef(false);
  const routedRef = useRef(false);
  const tabIdRef = useRef<string | null>(null);

  const scheduleNext = () => {
    if (cancelledRef.current || routedRef.current) return;
    timerRef.current = setTimeout(pollOnce, POLL_MS);
  };

  const pollOnce = async () => {
    if (cancelledRef.current || inFlightRef.current || routedRef.current) {
      scheduleNext();
      return;
    }
    const tab_id = tabIdRef.current;
    if (!tab_id) {
      setErrorMsg('tab_id が見つかりませんでした（local/sessionStorage または URL の ?tab_id= を確認してください）');
      return;
    }

    inFlightRef.current = true;
    try {
      const { data, error } = await supabase.functions.invoke<DecideAndRouteResp>('polling-api', {
        body: { method: 'decide-and-route', params: { tab_id } },
      });

      if (error) {
        setErrorMsg(error.message ?? 'decide-and-route の確認に失敗しました');
      } else if (data?.ok && data.matched && data.to) {
        routedRef.current = true;
        if (timerRef.current) clearTimeout(timerRef.current);
        navigate(data.to, { replace: true });
        return;
      }
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'ポーリング中にエラーが発生しました');
    } finally {
      inFlightRef.current = false;
      scheduleNext();
    }
  };

  // round を main-api / get-round で取得
  const fetchRound = async (tab_id: string) => {
    setRoundLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke<GetRoundResp>('main-api', {
        body: { method: 'get-round', params: { tab_id } },
      });
      if (error) {
        setErrorMsg(error.message ?? 'get-round の呼び出しに失敗しました');
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

  // 「次へ」→ ready-to-next を呼び、その後 decide-and-route をポーリング
  const handleNext = async () => {
    if (nexting || waitingRoute) return;
    const tab_id = tabIdRef.current ?? resolveTabId();
    if (!tab_id) {
      setErrorMsg('tab_id が見つかりませんでした（local/sessionStorage または URL の ?tab_id= を確認してください）');
      return;
    }
    tabIdRef.current = tab_id;

    setNexting(true);
    setErrorMsg(null);
    try {
      const { error } = await supabase.functions.invoke<unknown>('main-api', {
        body: { method: 'ready-to-next', params: { tab_id } },
      });
      if (error) {
        setErrorMsg(error.message ?? 'ready-to-next の呼び出しに失敗しました');
      } else {
        // 送信成功 → 以降は遷移先が確定するまでポーリング
        setWaitingRoute(true);
        // すぐ1回実行してから定期ポーリング
        if (timerRef.current) clearTimeout(timerRef.current);
        routedRef.current = false;
        cancelledRef.current = false;
        inFlightRef.current = false;
        pollOnce();
      }
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'ready-to-next の呼び出しに失敗しました（unknown error）');
    } finally {
      setNexting(false);
    }
  };

  useEffect(() => {
    cancelledRef.current = false;

    (async () => {
      try {
        const tab_id = resolveTabId();
        tabIdRef.current = tab_id;

        if (!tab_id) {
          setErrorMsg('tab_id が見つかりませんでした（local/sessionStorage または URL の ?tab_id= を確認してください）');
          return;
        }

        // 左上 round を取得
        fetchRound(tab_id);

        // ベスト回答＆その他を1回だけ取得（※ポーリングなし）
        const { data, error } = await supabase.functions.invoke<GetSelectedAnswerResp>(
          'main-api',
          { body: { method: 'get-selected-answer', params: { tab_id } } }
        );

        if (error) {
          setErrorMsg(error.message ?? '取得失敗');
        } else if (data?.ok) {
          setBest(data.best ?? null);
          setOthers(data.others ?? []);
        } else if (data?.error) {
          setErrorMsg(data.error);
        }
      } catch (e: any) {
        setErrorMsg(e?.message ?? '不明なエラーで取得失敗');
      }
    })();

    return () => {
      cancelledRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <>
      <div style={containerStyle}>

        {/* 左上：ラウンド表示 */}
        <div style={roundBadgeStyle}>
          <Round round={round} loading={roundLoading} />
        </div>


        {/* お題をタイトルコンポーネントで表示（現状タイトルの上） */}
        <Title
          text={best?.input_QA ? `「${best.input_QA}」` : 'お題未設定'}
          style={{
            fontSize: '2.2rem',
            marginBottom: '1vw', // 余白を広げる
            color: '#fcfbfbff',
            textAlign: 'center',
            fontWeight: 700,
          }}
        />
        <Title
          text="ベストな回答に選ばれたのは"
          style={{
            ...titleStyle,
            marginTop: '1vw', // 余白を追加
          }}
        />

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 30 }}>
          <Card
            userName={best?.user_name ?? ''}
            inputQA={best?.input_QA ?? '（まだ決定していません）'}
            selected={!!best}
            onClick={() => {}}
          />
        </div>

        <div style={{
          width: '350px',
          minHeight: '180px',
          background: '#7F9BE4',
          border: '2px solid #fff',
          borderRadius: '12px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.2rem',
          margin: '0 auto 30px auto',
          padding: '20px',
          textAlign: 'center',
          color: '#fff',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }}>
          <div style={{ fontWeight: 'bold', fontSize: '1.5rem', color: '#fff', marginBottom: '1vw' }}>
            他の人の回答
          </div>
          {others.length > 0 ? (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {others.map((a, idx) => (
                <li key={`${a.user_name}-${idx}`} style={{ marginBottom: '0.7em' }}>
                  <div className="roominfo-member" style={{
                    background: 'rgba(255,255,255,0.2)',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    fontWeight: 600,
                    color: '#fff',
                    display: 'inline-block',
                  }}>
                    <span style={{ fontWeight: 700 }}>{a.user_name}</span> : {a.input_QA}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div style={{ color: '#fff', fontSize: '1.1rem', opacity: 0.7 }}>（他の回答なし）</div>
          )}
        </div>

        {errorMsg && (
          <div style={{ color: 'crimson', marginBottom: 16 }}>{errorMsg}</div>
        )}

        <div style={{
          position: 'fixed',
          right: '4vw',
          bottom: '9vw',
          zIndex: 200,
        }}>
          <Button
            type="button"
            disabled={nexting || waitingRoute}
            onClick={handleNext}
          >
            {nexting ? '送信中…' : waitingRoute ? '待機中…' : '次へ'}
          </Button>
        </div>

        {/* pixel_character画像とpixel_girl画像を画面下中央に並べて挿入 */}
        <div style={{
          position: 'fixed',
          bottom: '8vw',
          left: '17vw',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: '2vw',
          zIndex: 50,
          alignItems: 'flex-end',
        }}>
          <img
            src={process.env.PUBLIC_URL + '/pixel_character.png'}
            alt="character"
            style={{
              width: '16vw',
              height: 'auto',
            }}
          />
          <img
            src={process.env.PUBLIC_URL + '/pixel_girl.png'}
            alt="girl"
            style={{
              width: '13vw',
              height: 'auto',
            }}
          />
        </div>
        {/* 花 */}
        <img
          src={process.env.PUBLIC_URL + '/pixel_flower.png'}
          alt="flower"
          style={{
            position: 'fixed',
            bottom: '8vw',
            right: '2vw',
            width: '10vw',
            height: 'auto',
            zIndex: 50,
            transform: 'scaleX(-1)',
          }}
        />

        {/* 雲画像3つを独立して画面上部に配置 */}
        <img
          src={process.env.PUBLIC_URL + '/pixel_cloud_small.png'}
          alt="cloud1"
          style={{
            position: 'fixed',
            top: '13vw',
            left: '1vw',
            width: '7vw',
            height: 'auto',
            zIndex: 30,
          }}
        />
        <img
          src={process.env.PUBLIC_URL + '/pixel_cloud_small.png'}
          alt="cloud2"
          style={{
            position: 'fixed',
            top: '6vw',
            left: '11vw',
            width: '9vw',
            height: 'auto',
            zIndex: 30,
          }}
        />
        <img
          src={process.env.PUBLIC_URL + '/pixel_cloud_small.png'}
          alt="cloud3"
          style={{
            position: 'fixed',
            top: '2vw',
            right: '12vw',
            width: '10vw',
            height: 'auto',
            zIndex: 30,
          }}
        />
      </div>
      {/* DanmakuInputを最下部に追加 */}
      <DanmakuInput fixedBottom />
    </>
  );
}

export default SelectedAnswer;
