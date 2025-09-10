import React from 'react';
import { Header } from './components/Header';
import { TaskForm } from './components/TaskForm';
import { TaskItem } from './components/TaskItem';
import { TaskFilters } from './components/TaskFilters';
import { useTasks } from './hooks/useTasks';

function App() {
  const {
    tasks,
    filter,
    setFilter,
    addTask,
    updateTask,
    deleteTask,
    toggleTask,
    categories,
    stats
  } = useTasks();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        <Header stats={stats} />
        
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mt-8">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <TaskFilters
              filter={filter}
              onFilterChange={setFilter}
              categories={categories}
              stats={stats}
            />
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3 space-y-6">
            <TaskForm onSubmit={addTask} categories={categories} />
            
            <div className="space-y-4">
              {tasks.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-gray-400 text-lg mb-2">タスクがありません</div>
                  <div className="text-gray-500 text-sm">
                    上のフォームから新しいタスクを追加してください
                  </div>
                </div>
              ) : (
                tasks.map(task => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    onToggle={toggleTask}
                    onDelete={deleteTask}
                    onUpdate={updateTask}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
