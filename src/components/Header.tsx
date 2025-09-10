import React from 'react';
import { CheckSquare, TrendingUp, Calendar, AlertTriangle } from 'lucide-react';

interface HeaderProps {
  stats: {
    total: number;
    completed: number;
    active: number;
    overdue: number;
  };
}

export const Header: React.FC<HeaderProps> = ({ stats }) => {
  const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  return (
    <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-8 rounded-2xl shadow-lg">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <CheckSquare className="w-8 h-8" />
          <h1 className="text-3xl font-bold">タスクマネージャー</h1>
        </div>
        <div className="text-right">
          <div className="text-sm opacity-90">今日の日付</div>
          <div className="text-lg font-semibold">
            {new Date().toLocaleDateString('ja-JP', { 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric',
              weekday: 'long'
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
          <div className="flex items-center gap-3">
            <CheckSquare className="w-6 h-6 text-blue-200" />
            <div>
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-sm opacity-90">総タスク数</div>
            </div>
          </div>
        </div>

        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-6 h-6 text-green-200" />
            <div>
              <div className="text-2xl font-bold">{stats.completed}</div>
              <div className="text-sm opacity-90">完了済み</div>
            </div>
          </div>
        </div>

        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
          <div className="flex items-center gap-3">
            <Calendar className="w-6 h-6 text-yellow-200" />
            <div>
              <div className="text-2xl font-bold">{stats.active}</div>
              <div className="text-sm opacity-90">未完了</div>
            </div>
          </div>
        </div>

        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-red-200" />
            <div>
              <div className="text-2xl font-bold">{stats.overdue}</div>
              <div className="text-sm opacity-90">期限切れ</div>
            </div>
          </div>
        </div>
      </div>

      {stats.total > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm opacity-90">進捗率</span>
            <span className="text-sm font-semibold">{completionRate}%</span>
          </div>
          <div className="w-full bg-white/20 rounded-full h-2">
            <div 
              className="bg-white rounded-full h-2 transition-all duration-500"
              style={{ width: `${completionRate}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};