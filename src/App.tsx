import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import TopMenu from './TopMenu';
import SubPage from './SubPage';
import Standby from './Standby';
import ParentToppickPage from './ParentTopicPage';
import ParentWaiting from './ParentWaiting';
import ChildAnswer from './ChildAnswer';
import ChildWaiting from './ChildWaiting';
import LastAnswer from './lastAnswer';
import SelectedAnswer from './SelectedAnswer';
import ParentSelectAnser from './ParentSelectAnswer';
import ChildAnswerList from './ChildAnswerList';
import DanmakuProvider from './DanmakuProvider';
import './App.css';
import TestPage from './test';

function App() {
  const [soilCount, setSoilCount] = useState(Math.ceil(window.innerWidth / 64) + 2);

  useEffect(() => {
    const handleResize = () => {
      setSoilCount(Math.ceil(window.innerWidth / 64) + 2);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="App">
      <Router>
        <DanmakuProvider>
          <Routes>
            <Route path="/" element={<TopMenu />} />
            <Route path="/sub" element={<SubPage />} />
            <Route path="/standby" element={<Standby />} />
            <Route path="/parenttopick" element={<ParentToppickPage />} />
            <Route path="/parentwaiting" element={<ParentWaiting />} />
            <Route path="/childwating" element={<ChildWaiting />} />
            <Route path="/childanswer" element={<ChildAnswer />} />
            <Route path="/childanswerlist" element={<ChildAnswerList />} />
            <Route path="/parentselectanswer" element={<ParentSelectAnser />} />
            <Route path="/selectedanswer" element={<SelectedAnswer />} />
            <Route path="/lastanswer" element={<LastAnswer />} />
            <Route path="/test" element={<TestPage />} />
          </Routes>
        </DanmakuProvider>
      </Router>
      {/* 背景 */}
      <div className="ground-soil">
        {Array.from({ length: soilCount }).map((_, i) => (
          <img
            key={i}
            src="/tile_soil.png"
            alt="soil"
            className="soil-img"
          />
        ))}
      </div>
    </div>
  );
}

export default App;
