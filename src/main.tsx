import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import './index.css'
import HomePage from './pages/HomePage'
import CarPage from './pages/CarPage'

const router = createBrowserRouter([
  { path: '/', element: <HomePage /> },
  { path: '/cars/:id', element: <CarPage /> },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
