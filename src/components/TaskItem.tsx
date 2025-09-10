import React, { useState } from 'react';
import { Check, Clock, Flag, Tag, Trash2, Edit3, Calendar } from 'lucide-react';
import { Task } from '../types';

interface TaskItemProps {
  task: Task;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Task>) => void;
}

export const TaskItem: React.FC<TaskItemProps> = ({ task, onToggle, onDelete, onUpdate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    title: task.title,
    description: task.description,
    priority: task.priority,
    category: task.category,
    dueDate: task.dueDate ? task.dueDate.toISOString().split('T')[0] : ''
  });

  const handleSave = () => {
    onUpdate(task.id, {
      title: editData.title,
      description: editData.description,
      priority: editData.priority,
      category: editData.category,
      dueDate: editData.dueDate ? new Date(editData.dueDate) : undefined
    });
    setIsEditing(false);
  };

  const priorityColors = {
    low: 'text-green-600 bg-green-50',
    medium: 'text-yellow-600 bg-yellow-50',
    high: 'text-red-600 bg-red-50'
  };

  const priorityLabels = {
    low: '低',
    medium: '中',
    high: '高'
  };

  const isOverdue = task.dueDate && task.dueDate < new Date() && !task.completed;
  const isDueSoon = task.dueDate && task.dueDate > new Date() && 
    task.dueDate.getTime() - new Date().getTime() < 24 * 60 * 60 * 1000;

  if (isEditing) {
    return (
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div className="space-y-4">
          <input
            type="text"
            value={editData.title}
            onChange={(e) => setEditData(prev => ({ ...prev, title: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
          <textarea
            value={editData.description}
            onChange={(e) => setEditData(prev => ({ ...prev, description: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
            rows={2}
          />
          <div className="grid grid-cols-3 gap-3">
            <select
              value={editData.priority}
              onChange={(e) => setEditData(prev => ({ ...prev, priority: e.target.value as any }))}
              className="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            >
              <option value="low">低優先度</option>
              <option value="medium">中優先度</option>
              <option value="high">高優先度</option>
            </select>
            <input
              type="text"
              value={editData.category}
              onChange={(e) => setEditData(prev => ({ ...prev, category: e.target.value }))}
              className="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
            <input
              type="date"
              value={editData.dueDate}
              onChange={(e) => setEditData(prev => ({ ...prev, dueDate: e.target.value }))}
              className="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              保存
            </button>
            <button
              onClick={() => setIsEditing(false)}
              className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
            >
              キャンセル
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white p-6 rounded-xl shadow-sm border transition-all duration-200 hover:shadow-md ${
      task.completed ? 'border-green-200 bg-green-50/30' : 
      isOverdue ? 'border-red-200 bg-red-50/30' :
      isDueSoon ? 'border-yellow-200 bg-yellow-50/30' : 'border-gray-100'
    }`}>
      <div className="flex items-start gap-4">
        <button
          onClick={() => onToggle(task.id)}
          className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
            task.completed 
              ? 'bg-green-500 border-green-500 text-white' 
              : 'border-gray-300 hover:border-green-400'
          }`}
        >
          {task.completed && <Check className="w-4 h-4" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h3 className={`font-medium text-gray-900 ${task.completed ? 'line-through text-gray-500' : ''}`}>
                {task.title}
              </h3>
              {task.description && (
                <p className={`mt-1 text-sm text-gray-600 ${task.completed ? 'line-through' : ''}`}>
                  {task.description}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsEditing(true)}
                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              >
                <Edit3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => onDelete(task.id)}
                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4 mt-3">
            <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${priorityColors[task.priority]}`}>
              <Flag className="w-3 h-3" />
              {priorityLabels[task.priority]}
            </div>

            <div className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs">
              <Tag className="w-3 h-3" />
              {task.category}
            </div>

            {task.dueDate && (
              <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
                isOverdue ? 'bg-red-100 text-red-700' :
                isDueSoon ? 'bg-yellow-100 text-yellow-700' :
                'bg-blue-100 text-blue-700'
              }`}>
                <Calendar className="w-3 h-3" />
                {task.dueDate.toLocaleDateString('ja-JP')}
              </div>
            )}

            <div className="text-xs text-gray-400 ml-auto">
              <Clock className="w-3 h-3 inline mr-1" />
              {task.createdAt.toLocaleDateString('ja-JP')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};