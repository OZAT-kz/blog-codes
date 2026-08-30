// ==============================================================================
// spanner_ecommerce_schema_ru.sql
// Source: OZAT Engineering Hub (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/spanner_ecommerce_schema_ru.sql
// ==============================================================================

BEGIN TRANSACTION;
SELECT available_stock FROM inventory WHERE sku_id = 'SAMSUNG-OLED-65' FOR UPDATE;
-- Проверка остатка и декремент
UPDATE inventory 
SET available_stock = available_stock - 1, 
    reserved_stock = reserved_stock + 1 
WHERE sku_id = 'SAMSUNG-OLED-65';
COMMIT;</code></pre>

<p>В реляционной БД вроде PostgreSQL строка мгновенно захватывается в <code>RowExclusiveLock</code>. Первая транзакция выполняется, а остальные 5 999 транзакций выстраиваются в очередь ожидания. Время удержания блокировки лавинообразно растет, соединения в PgBouncer забиваются за несколько секунд, новые HTTP-запросы перестают приниматься сервером, и вся система впадает в ступор. Попытка переложить остатки в Redis спасает только до момента сброса транзакции в мастер-базу для фискализации и создания заказа.</p>

<h3>2. Лаг репликации и фантомные остатки</h3>
<p>Чтобы разгрузить мастер-ноду, разработчики направили весь поисковый трафик и просмотр каталога на Read-реплики. Но когда на мастер обрушился поток транзакций, WAL-журнал (Write-Ahead Logging) стал расти гигабайтами в минуту. Репликация стала отставать на 25–45 секунд. Пользователь видел на реплике, что стиральная машина есть в наличии, проходил шаги скоринга, а на этапе финальной записи в мастер получал ошибку «Товар уже распродан». Разъяренные покупатели начинали агрессивно обновлять страницу и спамить кнопку покупки, создавая разрушительный <strong>Retry Storm</strong> (шторм повторных запросов).</p>

<h3>3. Слепота стандартного HPA в Kubernetes</h3>
<p>Стандартный Horizontal Pod Autoscaler в Kubernetes по умолчанию работает на основе метрик потребления CPU и RAM. На распродажах такая схема гарантирует отказ: пока CPU поднимется до пороговых 80%, пока контроллер HPA отреагирует (cooldown 15–30 секунд), пока облачный провайдер выделит новые ноды (2–4 минуты), ваши пользователи уже получат сотни тысяч 502/504 ошибок и уйдут к конкурентам. Система должна масштабироваться <strong>реактивно по входящим событиям</strong>, а не пост-фактум по горящему железу.</p>

<p>Как мы подробно разбирали в нашем материале про <a href="/blog/document-ai-kz-accounting" class="text-gc-blue hover:underline font-medium">автоматизацию сложных бизнес-процессов через Document AI</a>, попытка натянуть старые монолитные паттерны на принципиально новые объемы нагрузок всегда заканчивается крахом. Требовался радикальный архитектурный сдвиг.</p>

<h2>Архитектурная революция: GKE Autopilot + Cloud Spanner</h2>

<p>Мы спроектировали абсолютно новую целевую архитектуру на базе лучших серверных и распределенных технологий Google Cloud Platform:</p>

<ol>
  <li><strong>Google Kubernetes Engine (GKE) Autopilot:</strong> бессерверный управляемый кластер Kubernetes, где Google берет на себя управление нодами, безопасность, автомасштабирование пулов узлов и оптимизацию сетевого стека с технологией eBPF.</li>
  <li><strong>Google Cloud Spanner:</strong> глобально распределенная реляционная СУБД с аппаратной поддержкой синхронизации времени <strong>TrueTime API</strong>, сочетающая неограниченную горизонтальную масштабируемость NoSQL и строгие ACID-гарантии классического SQL.</li>
  <li><strong>KEDA (Kubernetes Event-driven Autoscaling) + Cloud Pub/Sub:</strong> предиктивное масштабирование микросервисов на основе глубины очередей заказов с реакцией за секунды.</li>
  <li><strong>Google Cloud Armor + Cloud CDN:</strong> фильтрация бот-трафика, защита от DDoS и кэширование статики на периметре сети Google (Edge PoP в Казахстане).</li>
</ol>

<h2>Почему именно Cloud Spanner, а не NoSQL или шардированный Postgres?</h2>

<p>При проектировании highload-архитектур часто возникает искушение взять документную NoSQL-базу данных (MongoDB, Cassandra, DynamoDB). Однако в контексте ритейла и банковских рассрочек это путь в юридический и финансовый тупик. NoSQL жертвует строгой консистентностью ради масштабируемости (теорема CAP / BASE-модель). В ситуации, когда на складе остался один iPhone, eventual consistency гарантирует, что вы продадите его двум разным людям, спишете с обоих деньги через Kaspi Pay и получите грандиозный скандал.</p>

<p>С другой стороны, ручной шардинг PostgreSQL (Citus / Vitess) — это колоссальная инженерная сложность: потеря кросс-шардовых транзакций, невозможность прозрачных JOIN-запросов и адская боль при добавлении новых шардов прямо во время распродажи.</p>

<p><strong>Cloud Spanner уничтожил компромисс между ACID и горизонтальным масштабированием.</strong> Благодаря TrueTime API (атомные часы и GPS-приемники во всех дата-центрах Google) Spanner обеспечивает:</p>

<ul>
  <li><strong>External Consistency (строгая внешняя согласованность):</strong> если транзакция Т2 началась после завершения Т1, Т2 гарантированно видит все изменения Т1 в глобальном масштабе.</li>
  <li><strong>Автоматический сплит таблетов (Tablets Split):</strong> Spanner автоматически делит таблицы на шарды (таблеты) размером до 4 GB и перераспределяет их между десятками узлов при росте трафика или объема данных.</li>
  <li><strong>Zero-Maintenance & Resizing:</strong> увеличение вычислительной мощности с 5 до 100 Spanner Processing Units (SPU) происходит в один API-вызов за 30 секунд без простоя и блокировки таблиц.</li>
</ul>

<h3>Проектирование схемы Cloud Spanner: Ликвидируем Hotspotting</h3>

<p>Главная ошибка при переходе на Spanner — перенос схемы PostgreSQL «как есть». В Spanner нельзя использовать автоинкрементные ID (1, 2, 3...) или последовательные таймстемпы в первичном ключе! Иначе все записи устремятся в один крайний таблет, создавая раскаленную точку перегрузки (Hotspotting).</p>

<p>Мы использовали генерацию UUIDv4 с битовой маской и внедрили ключевую возможность Spanner — <strong>Interleaved Tables (вложенные таблицы)</strong>. Вложенные таблицы физически хранят строки дочерней таблицы (позиции заказа) на том же дисковом блоке рядом с родительской строкой (заказ и клиент):</p>

<pre><code class="language-sql">-- DDL Схема Cloud Spanner для e-commerce с защитой от Hotspotting (Interleaved таблицы)
CREATE TABLE Customers (
  CustomerId STRING(36) NOT NULL,
  FullName STRING(255) NOT NULL,
  PhoneNumber STRING(32) NOT NULL,
  CreatedAt TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true),
) PRIMARY KEY (CustomerId);

CREATE TABLE Orders (
  CustomerId STRING(36) NOT NULL,
  OrderId STRING(36) NOT NULL,
  OrderStatus STRING(32) NOT NULL,
  TotalAmount NUMERIC NOT NULL,
  OrderTimestamp TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true),
) PRIMARY KEY (CustomerId, OrderId),
  INTERLEAVE IN PARENT Customers ON DELETE CASCADE;

CREATE TABLE OrderItems (
  CustomerId STRING(36) NOT NULL,
  OrderId STRING(36) NOT NULL,
  ItemId STRING(36) NOT NULL,
  SkuId STRING(64) NOT NULL,
  Quantity INT64 NOT NULL,
  UnitPrice NUMERIC NOT NULL,
) PRIMARY KEY (CustomerId, OrderId, ItemId),
  INTERLEAVE IN PARENT Orders ON DELETE CASCADE;

CREATE INDEX OrdersByStatusTimestamp ON Orders(OrderStatus, OrderTimestamp DESC);