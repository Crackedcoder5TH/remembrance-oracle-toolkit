// Test: pub-sub — inline assertions, no require
const bus = createPubSub();

// Basic publish/subscribe
const received = [];
bus.subscribe('test', (msg) => received.push(msg));
bus.publish('test', 'hello');
bus.publish('test', 'world');
if (received.length !== 2 || received[0] !== 'hello') throw new Error('Basic pub/sub failed');

// Multiple subscribers
let count = 0;
const bus2 = createPubSub();
bus2.subscribe('event', () => count++);
bus2.subscribe('event', () => count++);
bus2.publish('event');
if (count !== 2) throw new Error('Multiple subscribers failed: ' + count);

// Unsubscribe
const bus3 = createPubSub();
const msgs = [];
const unsub = bus3.subscribe('x', (m) => msgs.push(m));
bus3.publish('x', 'a');
unsub();
bus3.publish('x', 'b');
if (msgs.length !== 1 || msgs[0] !== 'a') throw new Error('Unsubscribe failed');

// Once
const bus4 = createPubSub();
const onceMsgs = [];
bus4.once('y', (m) => onceMsgs.push(m));
bus4.publish('y', 'first');
bus4.publish('y', 'second');
if (onceMsgs.length !== 1 || onceMsgs[0] !== 'first') throw new Error('Once failed');

// Wildcard *
const bus5 = createPubSub();
const wildcard = [];
bus5.subscribe('*', (topic, data) => wildcard.push({ topic, data }));
bus5.publish('user.created', { id: 1 });
if (wildcard.length !== 1 || wildcard[0].topic !== 'user.created') throw new Error('Wildcard failed');

// Hierarchical wildcard
const bus6 = createPubSub();
const hierMsgs = [];
bus6.subscribe('user.*', (data) => hierMsgs.push(data));
bus6.publish('user.created', 'new');
bus6.publish('order.placed', 'order');
if (hierMsgs.length !== 1 || hierMsgs[0] !== 'new') throw new Error('Hierarchical wildcard failed');

// Clear
const bus7 = createPubSub();
bus7.subscribe('a', () => {});
bus7.subscribe('b', () => {});
if (bus7.size !== 2) throw new Error('Size should be 2');
bus7.clear();
if (bus7.size !== 0) throw new Error('Clear should empty');
