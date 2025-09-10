import React from 'react';
import { Filter, CheckCircle, Circle, AlertCircle, Flag, Tag } from 'lucide-react';
import { TaskFilter } from '../types';

interface TaskFiltersProps {
  filter: TaskFilter;
  onFilterChange: (filter: TaskFilter) => void;
  categories: string[];
  stats: {
    total: number;
    completed: number;
    active: number;
    overdue: number;
  };
}

export const TaskFilters: React.FC<TaskFiltersProps> = ({ 
  filter, 
  onFilterChange, 
  categories, 
  stats 
}) => {
  const statusOptions = [
    { value: 'all', label: 'すべて', icon: Circle, count: stats.total },
    { value: 'active', label: '未完了', icon: AlertCircle, count: stats.active },
    { value: 'completed', label: '完了済み', icon: CheckCircle, count: stats.completed }
  ];

  const priorityOptions = [
    { value: 'all', label: 'すべて' },
    { value: 'high', label: '高優先度' },
    { value: 'medium', label: '中優先度' },
    { value: 'low', label: '低優先度' }
  ];

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
      <div className="flex items-center gap-2 mb-4">
        <Filter className="w-5 h-5 text-gray-600" />
        <h3 className="font-medium text-gray-900">フィルター</h3>
      </div>

      <div className="space-y-6">
        {/* Status Filter */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-3">ステータス</h4>
          <div className="space-y-2">
            {statusOptions.map(option => {
              const Icon = option.icon;
              return (
                <button
                  key={option.value}
                  onClick={() => onFilterChange({ ...filter, status: option.value as any })}
                  className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors ${
                    filter.status === option.value
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-4 h-4" />
                    <span className="text-sm">{option.label}</span>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    filter.status === option.value
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {option.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Priority Filter */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
            <Flag className="w-4 h-4" />
            優先度
          </h4>
          <select
            value={filter.priority}
            onChange={(e) => onFilterChange({ ...filter, priority: e.target.value as any })}
            className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          >
            {priorityOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Category Filter */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
            <Tag className="w-4 h-4" />
            カテゴリ
          </h4>
          <select
            value={filter.category}
            onChange={(e) => onFilterChange({ ...filter, category: e.target.value })}
            className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          >
            <option value="all">すべて</option>
            {categories.map(category => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>

        {/* Stats Summary */}
        {stats.overdue > 0 && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center gap-2 text-red-700">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm font-medium">
                {stats.overdue}件の期限切れタスク
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};