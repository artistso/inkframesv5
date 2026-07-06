package com.inkframe.core.common

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class JsonTest {

    @Test
    fun parsesPrimitives() {
        assertEquals(42.0, parseJson("42").asDouble(), 0.0)
        assertEquals(-3.14, parseJson("-3.14").asDouble(), 1e-9)
        assertEquals("hi", parseJson("\"hi\"").asString())
        assertTrue(parseJson("true").asBool())
        assertEquals(JsonValue.Null, parseJson("null"))
    }

    @Test
    fun parsesObjectAndArray() {
        val v = parseJson("""{"a":1,"b":[true,"x",null],"c":{"d":2.5}}""")
        assertEquals(1, v["a"].asInt())
        assertEquals(3, v["b"].asArr().items.size)
        assertEquals("x", v["b"].asArr().items[1].asString())
        assertEquals(2.5, v["c"]["d"].asDouble(), 1e-9)
    }

    @Test
    fun handlesEscapesAndUnicode() {
        val v = parseJson("\"line\\nbreak \\u0041 \\\"q\\\"\"")
        assertEquals("line\nbreak A \"q\"", v.asString())
    }

    @Test
    fun roundTripsThroughWriter() {
        val original = """{"name":"Untitled","frames":24,"loop":true,"tags":["a","b"],"nested":{"x":1.5}}"""
        val parsed = parseJson(original)
        val written = parsed.toJsonString(pretty = false)
        // Re-parse and compare structurally (key order is preserved by LinkedHashMap).
        assertEquals(parsed, parseJson(written))
    }

    @Test
    fun prettyPrintIsParseable() {
        val v = JsonValue.obj(
            "a" to JsonValue.of(1),
            "b" to JsonValue.arr(listOf(JsonValue.of("x"), JsonValue.of(2))),
            "c" to JsonValue.obj("d" to JsonValue.of(true)),
        )
        val pretty = v.toJsonString(pretty = true)
        assertTrue(pretty.contains("\n"))
        assertEquals(v, parseJson(pretty))
    }

    @Test
    fun emptyContainers() {
        assertEquals(0, parseJson("{}").asObj().entries.size)
        assertEquals(0, parseJson("[]").asArr().items.size)
        assertEquals("{}", JsonValue.obj().toJsonString())
        assertEquals("[]", JsonValue.arr(emptyList()).toJsonString())
    }

    @Test
    fun wholeNumbersWriteWithoutDecimalPoint() {
        assertEquals("5", JsonValue.of(5).toJsonString())
        assertEquals("5", JsonValue.of(5L).toJsonString())
        assertTrue(JsonValue.of(5.5f).toJsonString().startsWith("5.5"))
    }

    @Test(expected = JsonParseException::class)
    fun rejectsTrailingGarbage() {
        parseJson("""{"a":1} extra""")
    }

    @Test(expected = JsonParseException::class)
    fun rejectsUnterminatedString() {
        parseJson("\"oops")
    }

    @Test(expected = IllegalStateException::class)
    fun missingKeyThrows() {
        parseJson("{}")["nope"]
    }
}
