import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import './index.css'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import CarPage from './pages/CarPage'
import CreditsPage from './pages/CreditsPage'
import NotFoundPage from './pages/NotFoundPage'

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/cars/:id', element: <CarPage /> },
      { path: '/credits', element: <CreditsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
