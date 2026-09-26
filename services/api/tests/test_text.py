from app.services.text import jaccard, normalize_text, shingles, split_sentences


def test_normalize_text_is_case_and_punctuation_insensitive() -> None:
    assert normalize_text("Hello,   WORLD!") == "hello world"


def test_shingles_detect_shared_word_sequences() -> None:
    left = shingles("one two three four five six", width=3)
    right = shingles("zero two three four seven", width=3)
    assert ("two", "three", "four") in left & right


def test_jaccard_identical_sets_is_one() -> None:
    assert jaccard({1, 2}, {1, 2}) == 1.0


def test_split_sentences_filters_tiny_fragments() -> None:
    result = split_sentences("Hi. This is a valid sentence. Another valid sentence exists!")
    assert result == ["This is a valid sentence.", "Another valid sentence exists!"]
