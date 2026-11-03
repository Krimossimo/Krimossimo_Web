import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'
import { Layout } from './components/layout/Layout'
import HomePage from './pages/HomePage'
import AboutPage from './pages/AboutPage'
import ProjectsPage from './pages/ProjectsPage'
import ProjectDetailPage from './pages/ProjectDetailPage'
import ShopPage from './pages/ShopPage'
import GamesPage from './pages/GamesPage'
import ActivitiesPage from './pages/ActivitiesPage'
import ContactPage from './pages/ContactPage'
import CartPage from './pages/CartPage'
import CheckoutPage from './pages/CheckoutPage'
import NotFoundPage from './pages/NotFoundPage'

// Administration : chargée uniquement quand on visite /admin (aucun coût pour les visiteurs).
// Son accès réel est contrôlé par Firebase (claim admin, règles, fonctions), pas par ces routes.
const AdminRoot = lazy(() => import('./admin/AdminRoot'))
const AdminLoginPage = lazy(() => import('./admin/pages/LoginPage'))
const AdminOverviewPage = lazy(() => import('./admin/pages/OverviewPage'))
const AdminProjectsPage = lazy(() => import('./admin/pages/ProjectsPage'))
const AdminProjectEditorPage = lazy(() => import('./admin/pages/ProjectEditorPage'))
const AdminShopPage = lazy(() => import('./admin/pages/ShopPage'))
const AdminOfferEditorPage = lazy(() => import('./admin/pages/OfferEditorPage'))
const AdminGamesPage = lazy(() => import('./admin/pages/GamesPage'))
const AdminGameEditorPage = lazy(() => import('./admin/pages/GameEditorPage'))
const AdminOrdersPage = lazy(() => import('./admin/pages/OrdersPage'))
const AdminMessagesPage = lazy(() => import('./admin/pages/MessagesPage'))
const AdminAccountPage = lazy(() => import('./admin/pages/AccountPage'))

// BASE_URL vient de l'option "base" de Vite (ex. "/" ou "/krimossimo-web/").
const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'

export default function App() {
  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/:id" element={<ProjectDetailPage />} />
          <Route path="shop" element={<ShopPage />} />
          <Route path="games" element={<GamesPage />} />
          <Route path="activities" element={<ActivitiesPage />} />
          <Route path="contact" element={<ContactPage />} />
          <Route path="cart" element={<CartPage />} />
          <Route path="checkout" element={<CheckoutPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
        <Route
          path="admin"
          element={
            <Suspense fallback={null}>
              <AdminRoot />
            </Suspense>
          }
        >
          <Route index element={<AdminOverviewPage />} />
          <Route path="login" element={<AdminLoginPage />} />
          <Route path="projects" element={<AdminProjectsPage />} />
          <Route path="projects/new" element={<AdminProjectEditorPage />} />
          <Route path="projects/:id" element={<AdminProjectEditorPage />} />
          <Route path="shop" element={<AdminShopPage />} />
          <Route path="shop/new" element={<AdminOfferEditorPage />} />
          <Route path="shop/:id" element={<AdminOfferEditorPage />} />
          <Route path="games" element={<AdminGamesPage />} />
          <Route path="games/new" element={<AdminGameEditorPage />} />
          <Route path="games/:id" element={<AdminGameEditorPage />} />
          <Route path="orders" element={<AdminOrdersPage />} />
          <Route path="messages" element={<AdminMessagesPage />} />
          <Route path="account" element={<AdminAccountPage />} />
          <Route path="*" element={<AdminOverviewPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
