package com.inkframe.core.model

/**
 * Bounded token-to-binding registry used while native input is bridged into the original studio.
 *
 * The native overlay freezes a context token for one stroke. This registry resolves that token to
 * the immutable schema-2 binding that Kotlin received from the studio when the token was issued.
 * It owns no artwork and performs no project writes.
 */
class StudioStrokeBindingRegistry(
    private val capacity: Int = DEFAULT_CAPACITY,
) {
    init {
        require(capacity in 1..MAX_CAPACITY) { "capacity out of range: $capacity" }
    }

    private val lock = Any()
    private val bindings = LinkedHashMap<String, StudioStrokeBinding>()

    fun remember(snapshot: StudioContextSnapshot): Boolean {
        val validated = snapshot.validatedOrNull() ?: return false
        if (!validated.hasDrawableTarget || validated.contextToken.isBlank()) return false
        return remember(validated.strokeBinding())
    }

    fun remember(binding: StudioStrokeBinding): Boolean {
        val validated = binding.validatedOrNull() ?: return false
        synchronized(lock) {
            bindings.remove(validated.contextToken)
            bindings[validated.contextToken] = validated
            while (bindings.size > capacity) {
                val oldest = bindings.entries.iterator()
                if (!oldest.hasNext()) break
                oldest.next()
                oldest.remove()
            }
        }
        return true
    }

    fun resolve(contextToken: String): StudioStrokeBinding? = synchronized(lock) {
        bindings[contextToken]
    }

    fun clear() = synchronized(lock) {
        bindings.clear()
    }

    val size: Int
        get() = synchronized(lock) { bindings.size }

    companion object {
        const val DEFAULT_CAPACITY = 32
        const val MAX_CAPACITY = 256
    }
}
