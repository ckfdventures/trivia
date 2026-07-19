import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./App.css";
import Landing from "./pages/Landing";
import QuizBuilder from "./pages/QuizBuilder";
import HostLobby from "./pages/HostLobby";
import HostGame from "./pages/HostGame";
import PlayerJoin from "./pages/PlayerJoin";
import PlayerLobby from "./pages/PlayerLobby";
import PlayerGame from "./pages/PlayerGame";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/host/create" element={<QuizBuilder />} />
        <Route path="/host/lobby/:pin" element={<HostLobby />} />
        <Route path="/host/game/:pin" element={<HostGame />} />
        <Route path="/play/:pin/lobby" element={<PlayerLobby />} />
        <Route path="/play/:pin/game" element={<PlayerGame />} />
        <Route path="/play/:pin" element={<PlayerJoin />} />
        <Route path="/play" element={<PlayerJoin />} />
      </Routes>
    </BrowserRouter>
  );
}
