/* 本地规则版知识卡片提取：只使用原文句子，不生成原文没有的信息。 */
(function (global) {
  'use strict';

  var LEAD = /^(因为|由于|如果|当|在|随着|首先|其次|最后|例如|比如|因此|此外|另外|同时|但是|然而|总之|所以|结果|而|但|不过)[，,：:\s]*/;

  var CUES = [
    '核心', '关键', '因为', '原因', '由于', '因此', '所以', '结论', '表明', '说明',
    '意味着', '主要', '首先', '其次', '最后', '方法', '步骤', '例如', '比如',
    '必须', '需要', '应该', '可以', '导致', '影响', '区别', '不同于', '指的是',
    '称为', '即', '定义为', '结果', '目的', '作用'
  ];

  function normalizeText(text) {
    return String(text || '')
      .replace(/\r\n?/g, '\n')
      .replace(/\u3000/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .trim();
  }

  function splitSentences(text) {
    var parts = text.match(/[^。！？!?；;]+[。！？!?；;]?/g) || [];
    return parts
      .map(function (s) { return s.replace(/\s+/g, ' ').trim(); })
      .filter(function (s) { return s.length >= 10; });
  }

  function scoreSentence(sentence, index, total) {
    var score = 0;
    CUES.forEach(function (word) {
      if (sentence.indexOf(word) !== -1) score += 3;
    });
    if (/\d/.test(sentence)) score += 2;
    if (sentence.length >= 15 && sentence.length <= 90) score += 1;
    if (index < total * 0.25) score += 1;
    if (index > total * 0.7 && /因此|所以|总之|结论|综上|最后/.test(sentence)) score += 2;
    return score;
  }

  function bigrams(text) {
    var clean = text.replace(/[\s，。！？；;、：:",,.（）()【】]/g, '');
    var set = Object.create(null);
    for (var i = 0; i < clean.length - 1; i++) {
      set[clean.slice(i, i + 2)] = true;
    }
    return set;
  }

  function tooSimilar(a, b) {
    var A = bigrams(a);
    var B = bigrams(b);
    var keys = Object.keys(A);
    if (!keys.length || !Object.keys(B).length) return false;
    var shared = 0;
    keys.forEach(function (k) { if (B[k]) shared++; });
    return shared / Math.min(keys.length, Object.keys(B).length) > 0.65;
  }

  function makeQuestion(sentence) {
    if (/因为|由于|原因|导致/.test(sentence)) return '根据原文，造成这一情况的原因是什么？';
    if (/方法|步骤|应该|需要|必须|可以/.test(sentence)) return '根据原文，文中给出的做法或要求是什么？';
    if (/区别|不同|不同于|相比/.test(sentence)) return '根据原文，两者的关键区别是什么？';
    return '根据原文，这一知识点是如何表述的？';
  }

  function findContext(index, sentences, source) {
    var order = [index + 1, index - 1, index + 2, index - 2];
    for (var i = 0; i < order.length; i++) {
      var j = order[i];
      if (j < 0 || j >= sentences.length) continue;
      var candidate = sentences[j];
      if (candidate === source || tooSimilar(candidate, source)) continue;
      if (candidate.length < 10) continue;
      return candidate.length > 80 ? candidate.slice(0, 80) + '…' : candidate;
    }
    return '原文未提供更多解释，此处仅保留原文表述。';
  }

  function makeTitle(sentence, fallbackIndex) {
    var head = sentence.split(/[，,：:]/)[0].replace(LEAD, '').trim();
    if (head.length < 4) head = sentence.replace(LEAD, '').slice(0, 18);
    return head.length > 18 ? head.slice(0, 18) + '…' : head;
  }

  function buildCard(item, sentences, order) {
    var source = item.sentence;
    var example = null;
    [item.index + 1, item.index - 1].some(function (j) {
      if (j < 0 || j >= sentences.length) return false;
      if (/例如|比如|举例|如：/.test(sentences[j])) {
        example = sentences[j];
        return true;
      }
      return false;
    });

    return {
      title: makeTitle(source, order),
      core: source,
      explanation: findContext(item.index, sentences, source),
      fieldLabel: example ? '例子' : '自测问题',
      fieldValue: example || makeQuestion(source)
    };
  }

  function extractCards(text, max) {
    var limit = Math.max(1, Math.min(8, Number(max) || 8));
    var sentences = splitSentences(normalizeText(text));
    if (!sentences.length) {
      return { cards: [], note: '未能从输入中识别出有效句子。请粘贴更完整的正文。' };
    }

    var ranked = sentences.map(function (sentence, index) {
      return { sentence: sentence, index: index, score: scoreSentence(sentence, index, sentences.length) };
    }).sort(function (a, b) { return b.score - a.score; });

    var picked = [];
    ranked.forEach(function (item) {
      if (picked.length >= limit) return;
      if (picked.some(function (p) { return tooSimilar(p.sentence, item.sentence); })) return;
      picked.push(item);
    });
    picked.sort(function (a, b) { return a.index - b.index; });

    var cards = picked.map(function (item, index) {
      return buildCard(item, sentences, index);
    });
    var note = cards.length < 5
      ? '原文可提炼的独立知识点不足 5 个（本地规则版，只输出实际数量）。'
      : '';
    return { cards: cards, note: note };
  }

  function toMarkdown(result) {
    var body = result.cards.map(function (card, index) {
      return '## ' + (index + 1) + '. ' + card.title + '\n\n' +
        '- **核心知识**：' + card.core + '\n' +
        '- **简明解释**：' + card.explanation + '\n' +
        '- **' + card.fieldLabel + '**：' + card.fieldValue;
    }).join('\n\n');
    return body + (result.note ? '\n\n' + result.note : '') + '\n';
  }

  var api = { extractCards: extractCards, toMarkdown: toMarkdown };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.KnowledgeCards = api;
})(typeof window !== 'undefined' ? window : null);
