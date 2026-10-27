import { Router } from 'express';

const router = Router();

router.get('/dashboard', (_req, res) => {
  res.redirect('/dashboard.html');
});

export default router;
