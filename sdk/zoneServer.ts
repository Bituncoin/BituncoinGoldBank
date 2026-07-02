import express from 'express';
import zoneRoutes from './zoneRouter';

const app = express();
app.use(express.json());

// Attach global zone engine routes
app.use('/api', zoneRoutes);

// You can mount this into your existing server or run standalone
app.listen(8125, () => {
  console.log('BTNG Global Zone Engine live on port 8125');
});
