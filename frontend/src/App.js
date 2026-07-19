import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./App.css";
import Landing from "./pages/Landing";
import QuizBuilder from "./pages/QuizBuilder";
import HostLobby from "./pages/HostLobby";
import HostGame from "./pages/HostGame";
import PlayerJoin from "./pages/PlayerJoin";
import PlayerLobby from "./pages/PlayerLobby";
import PlayerGame from "./pages/PlayerGame";
import Login from "./pages/Login";
import Register from "./pages/Register";
import MyGames from "./pages/dashboard/MyGames";
import Reports from "./pages/dashboard/Reports";
import ReportDetail from "./pages/dashboard/ReportDetail";
import QuestionBank from "./pages/dashboard/QuestionBank";
import Settings from "./pages/dashboard/Settings";
import { Discover, Marketplace } from "./pages/dashboard/Placeholders";
import { AuthProvider } from "./lib/auth";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { DashboardLayout } from "./components/DashboardLayout";
import { SessionExpiredModal } from "./components/SessionExpiredModal";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SessionExpiredModal />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          <Route path="/host/create" element={<QuizBuilder />} />
          <Route path="/host/lobby/:pin" element={<HostLobby />} />
          <Route path="/host/game/:pin" element={<HostGame />} />
          <Route path="/play/:pin/lobby" element={<PlayerLobby />} />
          <Route path="/play/:pin/game" element={<PlayerGame />} />
          <Route path="/play/:pin" element={<PlayerJoin />} />
          <Route path="/play" element={<PlayerJoin />} />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard/games" replace />} />
            <Route path="games" element={<MyGames />} />
            <Route path="reports" element={<Reports />} />
            <Route path="reports/:sessionId" element={<ReportDetail />} />
            <Route path="upload" element={<QuestionBank />} />
            <Route path="discover" element={<Discover />} />
            <Route path="marketplace" element={<Marketplace />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
