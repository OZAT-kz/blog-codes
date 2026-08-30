-- ==============================================================================
-- Kaspi Жұма бір де бір даунсекундсыз: GKE және Cloud Spanner-ге көшу арқылы e-commerce-тегі х50 трафиктен қалай аман өттік
-- Source: OZAT Engineering Hub (https://ozat.kz)
-- GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/spanner_ecommerce_schema_kz.sql
-- ==============================================================================

BEGIN TRANSACTION;
SELECT available_stock FROM inventory WHERE sku_id = 'SAMSUNG-OLED-65' FOR UPDATE;
-- Қалдықты тексеру және азайту
UPDATE inventory 
SET available_stock = available_stock - 1, 
    reserved_stock = reserved_stock + 1 
WHERE sku_id = 'SAMSUNG-OLED-65';
COMMIT;</code></pre>

<p>PostgreSQL-де бұл жол лезде <code>RowExclusiveLock</code> арқылы құлыпталады. Бірінші транзакция орындалады, ал қалған 5 999 транзакция кезекке тұрады. Құлыптау уақыты геометриялық прогрессиямен өседі, PgBouncer қосылымдары санаулы секундта бітеді, жаңа HTTP-сұраныстар қабылданбайды және бүкіл жүйе тұрып қалады. Қалдықтарды Redis-ке салу тек тапсырысты мастер-базаға түпкілікті жазу кезеңіне дейін ғана көмектеседі.</p>

<h3>2. Репликацияның кешігуі және фантомдық қалдықтар</h3>
<p>Мастер-ноданы босату үшін каталогты қарау және іздеу сұраныстары Read-репликаларға бағытталды. Бірақ мастерге түскен алапат транзакциялар ағынынан WAL-журналы минутына гигабайттап өсе бастады. Репликация 25–45 секундқа кешікті. Қолданушы репликадан кір жуғыш машинаның бар екенін көріп, рәсімдеуге өтетін, ал соңғы қадамда «Тауар таусылды» деген қате алатын. Ызаланған клиенттер бетті қайта-қайта жаңартып, сатып алу түймесін баса бергендіктен, жойқын <strong>Retry Storm</strong> (қайталанатын сұраныстар дауылы) туындады.</p>

<h3>3. Kubernetes-тегі стандартты HPA-ның соқырлығы</h3>
<p>Kubernetes-тегі стандартты Horizontal Pod Autoscaler әдепкі бойынша CPU және RAM жүктемесіне қарайды. Сатылымдарда бұл сәтсіздікке кепілдік береді: CPU 80%-ға жеткенше, HPA әрекет еткенше (15–30 секунд) және бұлттық провайдер жаңа нодаларды қосқанша (2–4 минут), жүйе жүз мыңдаған 502/504 қателерін таратып үлгереді. Жүйе ресурстар қызып кеткеннен кейін емес, <strong>кіріс оқиғалары бойынша алдын ала реактивті түрде</strong> масштабталуы тиіс.</p>

<p>Біз өзіміздің <a href="/blog/document-ai-kz-accounting?lang=kz" class="text-gc-blue hover:underline font-medium">Document AI арқылы бизнес-процестерді автоматтандыру туралы материалымызда</a> атап өткеніміздей, ескі монолиттік әдістерді жаңа ауқымдарға бейімдеу мүмкін емес. Түбегейлі жаңа архитектуралық серпіліс қажет болды.</p>

<h2>Архитектуралық серпіліс: GKE Autopilot + Cloud Spanner</h2>

<p>Біз Google Cloud Platform-ның ең үздік үлестірілген шешімдеріне негізделген жаңа мақсатты жүйені жобаладық:</p>

<ol>
  <li><strong>Google Kubernetes Engine (GKE) Autopilot:</strong> Google нодаларды, қауіпсіздікті және eBPF желілік стекін толық басқаратын серверсіз басқарылатын Kubernetes кластері.</li>
  <li><strong>Google Cloud Spanner:</strong> NoSQL-дің шексіз көлденең масштабталуын және классикалық SQL-дің қатаң ACID кепілдіктерін біріктіретін, уақытты <strong>TrueTime API</strong> арқылы синхрондайтын ғаламдық үлестірілген СУБД.</li>
  <li><strong>KEDA (Kubernetes Event-driven Autoscaling) + Cloud Pub/Sub:</strong> хабарламалар кезектерінің тереңдігіне сүйене отырып, микросервистерді санаулы секундтарда предиктивті түрде масштабтау.</li>
  <li><strong>Google Cloud Armor + Cloud CDN:</strong> боттарды сүзу, DDoS шабуылдарынан қорғану және Google-дың Қазақстандағы Edge PoP желілік түйіндерінде статиканы кэштеу.</li>
</ol>

<h2>Неліктен NoSQL немесе шардингтелген Postgres емес, Cloud Spanner?</h2>

<p>Highload жүйелерді жобалау кезінде NoSQL дерекқорын (MongoDB, Cassandra, DynamoDB) таңдау азғыруы жиі кездеседі. Алайда ритейл және банктік бөліп төлеу жағдайында бұл қаржылық тұңғиыққа апарады. NoSQL масштаб үшін қатаң консистенттілікті құрбан етеді (CAP теоремасы / BASE моделі). Егер қоймада 1 ғана iPhone қалып, eventual consistency салдарынан оны екі адамға бірдей сатып жіберсеңіз, Kaspi Pay арқылы екеуінен де ақша алынып, үлкен дау туындайды.</p>

<p>Екінші жағынан, PostgreSQL-ді қолмен шардингтеу (Citus / Vitess) — өте күрделі инженерлік ауыртпалық: шардар арасындағы транзакциялардың жоғалуы, JOIN сұраныстарының мүмкін еместігі және сатылым кезінде жаңа шардтарды қосудың қиындығы.</p>

<p><strong>Cloud Spanner ACID пен көлденең масштабтау арасындағы қайшылықты жойды.</strong> TrueTime API кешенінің (Google дата-орталықтарындағы атомдық сағаттар мен GPS қабылдағыштар) арқасында Spanner мыналарды қамтамасыз етеді:</p>

<ul>
  <li><strong>External Consistency (сыртқы қатаң сәйкестік):</strong> егер Т2 транзакциясы Т1 аяқталғаннан кейін басталса, Т2 ғаламдық ауқымда Т1-дің барлық өзгерістерін көреді.</li>
  <li><strong>Таблеттерді автоматты түрде бөлу (Splits):</strong> Spanner кестелерді көлемі 4 GB болатын таблеттерге бөліп, трафик өскен кезде оларды ондаған физикалық серверлерге автоматты түрде таратады.</li>
  <li><strong>Нөлдік үзіліспен өлшемін өзгерту:</strong> қуаттылықты 5-тен 100 SPU-ге (Spanner Processing Units) дейін арттыру дерекқорды бұғаттамай, бір ғана API шақыруымен 30 секундта орындалады.</li>
</ul>

<h3>Cloud Spanner схемасын жобалау: Hotspotting-тен құтылу</h3>

<p>Spanner-ге көшу кезіндегі ең басты қателік — PostgreSQL схемасын сол күйінде көшіру. Spanner-де автоинкременттік ID (1, 2, 3...) немесе бастапқы кілттің басында реттік уақыт белгілерін пайдалануға қатаң тыйым салынады! Әйтпесе, барлық жазулар бір ғана шеткі таблетке түсіп, жүйені тоқтатып тастайды (Hotspotting).</p>

<p>Біз UUIDv4 генерациясын қолдандық және Spanner-дің ең мықты мүмкіндігі — <strong>Interleaved Tables (кірістірілген кестелер)</strong> тұжырымдамасын енгіздік. Кірістірілген кестелер тапсырыс позицияларын физикалық түрде дискіде тапсырыс және тұтынушы жолымен бір блокта сақтайды:</p>

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
