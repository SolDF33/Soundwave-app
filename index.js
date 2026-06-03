const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const { createClient } = require('redis');

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'soundwave_api', 
    password: '1234', // <--- Pon tu clave aquí
    port: 5432,
});

// Creamos y conectamos el cliente de Redis
const redisClient = createClient({
    url: 'redis://127.0.0.1:6379'
});

// Escuchamos errores y confirmamos la conexión exitosa
redisClient.on('error', (err) => console.log('Error en Redis Client', err));

redisClient.connect().then(() => {
    console.log('Conectado exitosamente a Redis');
}); 

app.get('/api/catalogo', async (req, res) => {
    try {
        // 1. Capturamos qué página pide el frontend (por defecto la pág 1, de a 20 items)
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        
        // Calculamos desde dónde empezar a traer datos en la DB (Offset)
        const offset = (page - 1) * limit;

        // 2. Creamos una Clave Única para esta página en Redis.
        const cacheKey = `catalogo:page:${page}:limit:${limit}`;

        // 3. INTENTO DE LECTURA (Caché): Le preguntamos a Redis si ya tiene esta página
        const cachedData = await redisClient.get(cacheKey);

        if (cachedData) {
            // Si los datos estaban en la RAM
            console.log(`Sirviendo página ${page} desde Redis`);
            return res.json(JSON.parse(cachedData)); 
        }

        // 4. Si Redis no los tenía, vamos a buscarlo a PostgreSQL
        console.log(`Sirviendo página ${page} desde PostgreSQL (Disco)`);
        const result = await pool.query(
    'SELECT cancion_titulo AS titulo, minutos_duracion * 60 AS duracion_segundos, artista_nombre AS artista, genero_nombre AS genero FROM obtener_catalogo_completo() LIMIT $1 OFFSET $2', 
    [limit, offset]
);
        // 5. ESCRITURA EN CACHÉ: Guardamos el resultado en Redis para la próxima vez.
        // setEx guarda la clave y le pone un tiempo de vida (TTL) de 60 segundos.
        await redisClient.setEx(cacheKey, 60, JSON.stringify(result.rows));

        // 6. Finalmente, devolvemos las 20 canciones al usuario
        res.json(result.rows);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error interno en el servidor' });
    }
});

app.listen(3000, () => console.log('Backend corriendo en http://localhost:3000'));