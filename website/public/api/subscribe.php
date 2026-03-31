<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$SUBSCRIBERS_FILE = __DIR__ . '/../data/subscribers.json';
$CONFIG_FILE = __DIR__ . '/../data/config.json';

// Ensure data directory exists
$dataDir = dirname($SUBSCRIBERS_FILE);
if (!is_dir($dataDir)) {
    mkdir($dataDir, 0755, true);
}

function getSubscribers() {
    global $SUBSCRIBERS_FILE;
    if (!file_exists($SUBSCRIBERS_FILE)) return [];
    $data = json_decode(file_get_contents($SUBSCRIBERS_FILE), true);
    return is_array($data) ? $data : [];
}

function saveSubscribers($emails) {
    global $SUBSCRIBERS_FILE;
    file_put_contents($SUBSCRIBERS_FILE, json_encode($emails, JSON_PRETTY_PRINT));
}

function getConfig() {
    global $CONFIG_FILE;
    if (!file_exists($CONFIG_FILE)) return [];
    return json_decode(file_get_contents($CONFIG_FILE), true) ?: [];
}

// POST: subscribe
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $email = isset($input['email']) ? strtolower(trim($input['email'])) : '';

    if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        http_response_code(400);
        echo json_encode(['error' => 'invalid_email']);
        exit;
    }

    $subscribers = getSubscribers();

    if (in_array($email, $subscribers)) {
        http_response_code(409);
        echo json_encode(['error' => 'already_subscribed']);
        exit;
    }

    $subscribers[] = $email;
    saveSubscribers($subscribers);

    // Send notification email (uses PHP mail())
    $config = getConfig();
    $notifyEmail = isset($config['notify_email']) ? $config['notify_email'] : '';
    if ($notifyEmail) {
        $subject = "New waitlist signup: $email";
        $body = "New signup on oschief.ai waitlist:\n\n$email\n\nTotal subscribers: " . count($subscribers);
        $headers = "From: waitlist@oschief.ai\r\nReply-To: $email";
        @mail($notifyEmail, $subject, $body, $headers);
    }

    echo json_encode(['ok' => true, 'count' => count($subscribers)]);
    exit;
}

// GET: list subscribers (protected)
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $config = getConfig();
    $secret = isset($_GET['secret']) ? $_GET['secret'] : '';
    $expected = isset($config['admin_secret']) ? $config['admin_secret'] : '';

    if (!$expected || $secret !== $expected) {
        http_response_code(401);
        echo json_encode(['error' => 'unauthorized']);
        exit;
    }

    $subscribers = getSubscribers();
    echo json_encode(['count' => count($subscribers), 'subscribers' => $subscribers]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'method_not_allowed']);
