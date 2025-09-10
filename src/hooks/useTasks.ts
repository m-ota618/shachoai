import { useState, useEffect } from 'react';
import { Task, TaskFilter } from '../types';

const STORAGE_KEY = 'tasks';

export const useTasks = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<TaskFilter>({
    status: 'all',
    priority: 'all',
    category: 'all'
  });

  // Load tasks from localStorage on mount
  useEffect(() => {
    const savedTasks = localStorage.getItem(STORAGE_KEY);
    if (savedTasks) {
      const parsedTasks = JSON.parse(savedTasks).map((task: any) => ({
        ...task,
        createdAt: new Date(task.createdAt),
        dueDate: task.dueDate ? new Date(task.dueDate) : undefined
      }));
      setTasks(parsedTasks);
    }
  }, []);

  // Save tasks to localStorage whenever tasks change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }, [tasks]);

  const addTask = (taskData: Omit<Task, 'id' | 'createdAt'>) => {
    const newTask: Task = {
      ...taskData,
      id: crypto.randomUUID(),
      createdAt: new Date()
    };
    setTasks(prev => [newTask, ...prev]);
  };

  const updateTask = (id: string, updates: Partial<Task>) => {
    setTasks(prev => prev.map(task => 
      task.id === id ? { ...task, ...updates } : task
    ));
  };

  const deleteTask = (id: string) => {
    setTasks(prev => prev.filter(task => task.id !== id));
  };

  const toggleTask = (id: string) => {
    updateTask(id, { completed: !tasks.find(t => t.id === id)?.completed });
  };

  const filteredTasks = tasks.filter(task => {
    if (filter.status === 'active' && task.completed) return false;
    if (filter.status === 'completed' && !task.completed) return false;
    if (filter.priority !== 'all' && task.priority !== filter.priority) return false;
    if (filter.category !== 'all' && task.category !== filter.category) return false;
    return true;
  });

  const categories = Array.from(new Set(tasks.map(task => task.category)));

  const stats = {
    total: tasks.length,
    completed: tasks.filter(t => t.completed).length,
    active: tasks.filter(t => !t.completed).length,
    overdue: tasks.filter(t => 
      !t.completed && t.dueDate && t.dueDate < new Date()
    ).length
  };

  return {
    tasks: filteredTasks,
    filter,
    setFilter,
    addTask,
    updateTask,
    deleteTask,
    toggleTask,
    categories,
    stats
  };
};